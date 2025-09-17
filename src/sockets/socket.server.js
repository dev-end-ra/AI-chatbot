const {Server} = require("socket.io");
const cookie = require("cookie");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const aiService = require("../services/ai.service");
const messageModel = require("../models/message.model");
const {createMemory, queryMemory} = require("../services/vector.service");

const initSocketServer = (httpServer)=>{
    const io = new Server(httpServer, {});

    io.use(async (socket, next)=>{
        const cookies = cookie.parse(socket.handshake.headers?.cookie || "");
        // console.log("Socket connection cookies: ", cookies);

        if(!cookies.token){
            return next(new Error("Authentication error: No token provided!!"));
        }

        try{
            const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
            const user = await userModel.findById(decoded.id);
            socket.user = user;
            next();
        }
        catch(error){
            return next(new Error("Authentication error: Invalid Token!!"));
        }
    })

    io.on("connection", (socket)=>{
        // console.log("Socket user: ", socket.user);
        // console.log("New Socket Connected", socket.id);

        socket.on("ai-message", async (messagePayload)=>{
            console.log("AI message: ", messagePayload);

            const message = await messageModel.create({
                chat: messagePayload.chat,
                user: socket.user._id,
                content: messagePayload.content,
                role: "user",
            });

            const vectors = await aiService.generateVector(messagePayload.content);
            // console.log("Generated Vectors: ", vectors);

            await createMemory({
                vectors: vectors,
                messageId: message._id,
                metadata: {
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    text: messagePayload.content,
                }
            });

            const memory = await queryMemory({
                queryVector: vectors,
                limit: 3,
                metadata: {}
            })

            // console.log("Memory: ", memory);

            const chatHistory = (await messageModel.find({
                chat: messagePayload.chat,
            }).sort({createdAt: -1}).limit(4).lean()).reverse();

            const stm = chatHistory.map((item)=>{   // this map will store the Memory of previous chats.
                return {
                    role: item.role,
                    parts: [{text: item.content}],
                };
            });

            const ltm = [{
                role: "user",
                parts: [{
                    text: `These are the some previous messages from the chat, use them to generate a response
                    ${memory.map((item)=> item.metadata.text).join("\n")}
                    `
                }]
            }];

            console.log(ltm[0]);
            console.log(stm[0]);

            const response = await aiService.generateResponse([...ltm, ...stm]);

            const responseMessage = await messageModel.create({
                chat: messagePayload.chat,
                user: socket.user._id,
                content: response,
                role: "model",
            });

            const responseVectors = await aiService.generateVector(response);

            await createMemory({
                vectors: responseVectors,
                messageId: responseMessage._id,
                metadata: {
                    chat: messagePayload.chat,
                    user: socket.user._id,
                    text: response,
                }
            });

            socket.emit("ai-response", {
                content: response,
                chat: messagePayload.chat,
            });
        })
    });
};

module.exports = initSocketServer;