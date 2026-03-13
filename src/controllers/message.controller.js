import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId },
    }).select("-password");

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    // mark incoming messages as read
    const unreadIncoming = await Message.find({
      senderId: userToChatId,
      receiverId: myId,
      isRead: false,
    }).select("_id");

    if (unreadIncoming.length > 0) {
      await Message.updateMany(
        { senderId: userToChatId, receiverId: myId, isRead: false },
        { $set: { isRead: true } },
      );

      const senderSocketId = getReceiverSocketId(userToChatId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesRead", {
          messageIds: unreadIncoming.map((m) => m._id.toString()),
          readerId: myId,
        });
      }
    }

    const hydratedMessages = messages
      .filter((msg) => {
        if (msg.isDeletedForEveryone) return false;
        if (msg.deletedFor?.some((id) => id.toString() === myId.toString()))
          return false;
        return true;
      })
      .map((msg) => {
        if (msg.senderId.toString() === userToChatId.toString()) {
          return { ...msg.toObject(), isRead: true };
        }
        return msg;
      });

    res.status(200).json(hydratedMessages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image) {
      return res.status(400).json({ message: "Text or image is required." });
    }
    if (senderId.equals(receiverId)) {
      return res
        .status(400)
        .json({ message: "Cannot send messages to yourself." });
    }
    const receiverExists = await User.exists({ _id: receiverId });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl;
    if (image) {
      // upload base64 image to cloudinary
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    // find all the messages where the logged-in user is either sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    });

    const chatPartnerIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId.toString() === loggedInUserId.toString()
            ? msg.receiverId.toString()
            : msg.senderId.toString(),
        ),
      ),
    ];

    const unreadCounts = await Message.aggregate([
      { $match: { receiverId: loggedInUserId, isRead: false } },
      { $group: { _id: "$senderId", count: { $sum: 1 } } },
    ]);

    const unreadMap = unreadCounts.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});

    const chatPartners = await User.find({ _id: { $in: chatPartnerIds } })
      .select("-password")
      .lean();

    const chatPartnersWithUnread = chatPartners.map((partner) => ({
      ...partner,
      unreadCount: unreadMap[partner._id.toString()] || 0,
    }));

    res.status(200).json(chatPartnersWithUnread);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.query.scope || "me"; // me | everyone
    const requesterId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const isOwner = message.senderId.toString() === requesterId.toString();

    if (scope === "everyone" && !isOwner) {
      return res
        .status(403)
        .json({ message: "Only the sender can delete a message for everyone" });
    }

    if (scope === "everyone") {
      if (message.isDeletedForEveryone) {
        return res.status(200).json({ message: "Message already deleted" });
      }

      message.isDeletedForEveryone = true;
      message.deletedFor = [message.senderId, message.receiverId];
      await message.save();

      const receiverSocketId = getReceiverSocketId(
        message.receiverId.toString(),
      );
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("messageDeleted", {
          messageId: message._id,
        });
      }

      return res.status(200).json({ message: "Message deleted for everyone" });
    }

    // delete for me only
    const alreadyDeleted = message.deletedFor?.some(
      (id) => id.toString() === requesterId.toString(),
    );
    if (!alreadyDeleted) {
      message.deletedFor.push(requesterId);
      await message.save();
    }

    return res.status(200).json({ message: "Message deleted for you" });
  } catch (error) {
    console.error("Error in deleteMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
