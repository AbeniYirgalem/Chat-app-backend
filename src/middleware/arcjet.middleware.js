import aj from "../lib/arcjet.js";
import { isSpoofedBot } from "@arcjet/inspect";

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    const ip = forwarded
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (ip) return ip;
  }
  const headerIp =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress;
  return typeof headerIp === "string" ? headerIp : "";
};

export const arcjetProtection = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    if (clientIp && !req.ip) {
      req.ip = clientIp; // ensure Arcjet receives an IP value
    }

    const decision = await aj.protect(req);

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res
          .status(429)
          .json({ message: "Rate limit exceeded. Please try again later." });
      } else if (decision.reason.isBot()) {
        return res.status(403).json({ message: "Bot access denied." });
      } else {
        return res.status(403).json({
          message: "Access denied by security policy.",
        });
      }
    }

    // check for spoofed bots
    if (decision.results.some(isSpoofedBot)) {
      return res.status(403).json({
        error: "Spoofed bot detected",
        message: "Malicious bot activity detected.",
      });
    }

    next();
  } catch (error) {
    console.log("Arcjet Protection Error:", error);
    next();
  }
};
