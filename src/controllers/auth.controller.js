import crypto from "crypto";
import { sendVerificationEmail } from "../lib/emailService.js";
import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinary.js";

export const signup = async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // check if emailis valid: regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "Email already exists" });

    // 123456 => $dnjasdkasj_?dmsakmk
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      password: hashedPassword,
    });

    const verificationToken = crypto.randomBytes(32).toString("hex");
    newUser.verificationToken = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");
    newUser.verificationTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour

    await newUser.save();
    await sendVerificationEmail(newUser.email, verificationToken);

    res.status(201).json({
      message:
        "Account created. A verification email has been sent. Please check your inbox.",
    });
  } catch (error) {
    console.log("Error in signup controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const extractCloudinaryPublicId = (url) => {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean);

    if (parts[0]?.startsWith("v") && Number(parts[0].slice(1))) {
      parts.shift();
    }

    const filename = parts.pop();
    if (!filename) return null;

    const withoutExtension = filename.split(".").slice(0, -1).join(".");
    return [...parts, withoutExtension].filter(Boolean).join("/");
  } catch (error) {
    console.error("Failed to parse Cloudinary public ID:", error.message);
    return null;
  }
};

const deleteCloudinaryAssetIfPresent = async (url) => {
  if (!url) return;
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Failed to delete Cloudinary asset:", error.message);
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const messagesWithImages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
      image: { $exists: true, $ne: null, $ne: "" },
    }).select("image");

    await Promise.all(
      messagesWithImages.map((msg) =>
        deleteCloudinaryAssetIfPresent(msg.image),
      ),
    );
    await deleteCloudinaryAssetIfPresent(user.profilePic);

    await Message.deleteMany({
      $or: [{ senderId: userId }, { receiverId: userId }],
    });
    await User.deleteOne({ _id: userId });

    res.cookie("jwt", "", { maxAge: 0 });
    return res.status(200).json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    return res.status(500).json({ message: "Failed to delete account" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    // never tell the client which one is incorrect: password or email

    if (!user.isVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email before logging in" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Invalid credentials" });

    generateToken(user._id, res);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      profilePic: user.profilePic,
    });
  } catch (error) {
    console.error("Error in login controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      verificationToken: hashedToken,
      verificationTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Error verifying email:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const logout = (_, res) => {
  res.cookie("jwt", "", { maxAge: 0 });
  res.status(200).json({ message: "Logged out successfully" });
};

export const updateProfile = async (req, res) => {
  try {
    const { profilePic } = req.body;
    if (!profilePic)
      return res.status(400).json({ message: "Profile pic is required" });

    const userId = req.user._id;

    const uploadResponse = await cloudinary.uploader.upload(profilePic);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { profilePic: uploadResponse.secure_url },
      { new: true },
    );

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("Error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
