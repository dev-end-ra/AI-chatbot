const { Server } = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const aiService = require("../services/ai.service");
const messageModel = require("../models/message.model");
const { createMemory, queryMemory } = require("../services/vector.service");

const initSocketServer = (httpServer) => {
    const io = new Server(httpServer, {});

    io.use(async (socket, next) => {
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");

        if (!cookies.token) {
            return next(new Error("Authentication error: No token provided!!"));
        }

        try {
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            if (!user) {
                return next(new Error("Authentication error: User not found!!"));
            }
            socket.user = user;
            next();
        } catch (error) {
            return next(new Error("Authentication error: Invalid Token!!"));
        }
    });

    io.on("connection", (socket) => {
        socket.on("ai-message", async (messagePayload) => {
            try {
                console.log("AI message: ", messagePayload);

                // Save user message + generate vector in parallel
                const [message, vectors] = await Promise.all([
                    messageModel.create({
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        content: messagePayload.content,
                        role: "user",
                    }),
                    aiService.generateVector(messagePayload.content),
                ]);

                // Fetch related memory + recent chat history in parallel
                const [memory, chatHistory] = await Promise.all([
                    queryMemory({
                        queryVector: vectors,
                        limit: 3,
                        metadata: {},
                    }),
                    messageModel
                        .find({ chat: messagePayload.chat })
                        .sort({ createdAt: -1 })
                        .limit(4)
                        .lean()
                        .then((messages) => messages.reverse()), // oldest → newest
                ]);

                // Prepare context
                const stm = chatHistory.map((item) => ({
                    role: item.role,
                    parts: [{ text: item.content }],
                }));

                const ltm = [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `These are some previous messages from the chat, use them to generate a response:\n${memory
                                    .map((item) => item.metadata.text)
                                    .join("\n")}`,
                            },
                        ],
                    },
                ];

                console.log("LTM:", ltm[0]);
                console.log("STM first:", stm[0]);

                // Generate response
                const response = await aiService.generateResponse([
                    ...ltm,
                    ...stm,
                ]);

                // Save response message + generate vector in parallel
                const [responseMessage, responseVectors] = await Promise.all([
                    messageModel.create({
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        content: response,
                        role: "model",
                    }),
                    aiService.generateVector(response),
                ]);

                // Store response memory
                await createMemory({
                    vectors: responseVectors,
                    messageId: responseMessage._id,
                    metadata: {
                        chat: messagePayload.chat,
                        user: socket.user._id,
                        text: response,
                    },
                });

                // Send back to client
                socket.emit("ai-response", {
                    content: response,
                    chat: messagePayload.chat,
                });
            } catch (err) {
                console.error("Error handling ai-message:", err);
                socket.emit("ai-response", {
                    content: "Sorry, something went wrong!",
                    chat: messagePayload.chat,
                });
            }
        });
    });
};

module.exports = initSocketServer;
