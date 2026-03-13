import nodemailer from "nodemailer";
import { ENV } from "./env.js";
import { createVerificationEmailTemplate } from "../emails/emailTemplates.js";

const { EMAIL_USER, EMAIL_PASS, CLIENT_URL } = ENV;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn(
    "Email credentials are not fully configured. Set EMAIL_USER and EMAIL_PASS.",
  );
}

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

export const sendEmail = async ({ to, subject, html }) => {
  if (!EMAIL_USER) throw new Error("EMAIL_USER is not configured");

  const mailOptions = {
    from: EMAIL_USER,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
};

export const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${CLIENT_URL}/verify-email?token=${token}`;
  const html = createVerificationEmailTemplate(verificationUrl);

  await sendEmail({
    to: email,
    subject: "Verify your Chatify account",
    html,
  });
};
