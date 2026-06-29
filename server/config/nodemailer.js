import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendEmail = async (to, subject, text, html) => {
    const response = await transporter.sendMail({
        from: process.env.SENDER_EMAIL, 
        to: to,
        subject: subject,
        text: text, 
        html: html,
    });
    return response;
}

export default sendEmail;
