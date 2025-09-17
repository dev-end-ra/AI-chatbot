const userModel = require("../models/user.model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerUser = async (req, res) => {
  const {
    email,
    fullName: { firstName, lastName },
    password,
  } = req.body;
  const isUserAlreadyExists = await userModel.findOne({ email });

  if (isUserAlreadyExists) {
    return res.status(400).json({
      message: "User already Exists!!",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await userModel.create({
    email,
    fullName: { firstName, lastName },
    password: hashedPassword,
  });

  const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET);

  res.cookie("token", token);

  res.status(201).json({
    message: "User Registered Successfully!!",
    user: {
      email: newUser.email,
      fullName: newUser.fullName,
      _id: newUser._id,
    },
  });
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  const isUserExists = await userModel.findOne({ email });

  if (!isUserExists) {
    return res.status(400).json({
      message: "Invalid Credentials!!",
    });
  }

  const isPasswordCorrect = await bcrypt.compare(
    password,
    isUserExists.password
  );

  if (!isPasswordCorrect) {
    return res.status(400).json({
      message: "Invalid Credentials!!",
    });
  }

  const token = jwt.sign({ id: isUserExists._id }, process.env.JWT_SECRET);

  res.cookie("token", token);

  return res.status(200).json({
    message: "User logged in Successfully!!",
    user: {
      email: isUserExists.email,
      fullName: isUserExists.fullName,
      _id: isUserExists._id,
    },
  });
};

module.exports = {
  registerUser,
  loginUser,
};
