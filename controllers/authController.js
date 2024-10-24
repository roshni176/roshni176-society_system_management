const nodemailer = require('nodemailer');
const User = require('../models/User');
const { generateToken } = require('../utils/token');
const twilio = require('twilio');

// Email sending utility function
const sendEmail = async (email, subject, text) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_PORT === '465', // Use SSL for port 465
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Ensure this is your app password
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: subject,
      text: text,
    });

    console.log('OTP email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Email sending failed');
  }
};

// Generate a 6-digit OTP
// const generateOTP = () => {
//   return Math.floor(100000 + Math.random() * 900000).toString(); // Generates a 6-digit OTP
// };

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();  // 6 digit OTP
};
// Register a new user
exports.register = async (req, res) => {
  const { firstname, lastname, email, phone, country, state, city, society, password } = req.body;

  try {
    // Check if the user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create and save the new admin user
    const newUser = new User({
      firstname,
      lastname,
      email,
      phone,
      country,
      state,
      city,
      society,
      password,
      role: 'admin'  // Assign role as admin by default
    });

    await newUser.save();

    res.status(201).json({
      _id: newUser._id,
      firstname: newUser.firstname,
      lastname: newUser.lastname,
      email: newUser.email,
      phone: newUser.phone,
      country: newUser.country,
      state: newUser.state,
      city: newUser.city,
      society: newUser.society,
      role: newUser.role,  // Include role in the response
      token: generateToken(newUser),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    // Check if the user exists and if the password is valid
    if (user && (await user.comparePassword(password))) {
      res.json({
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
        country: user.country,
        state: user.state,
        city: user.city,
        society: user.society,
        token: generateToken(user),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
};

// Configure Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;  // Twilio Account SID from .env
const authToken = process.env.TWILIO_AUTH_TOKEN;    // Twilio Auth Token from .env
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; // Your Twilio phone number

const client = twilio(accountSid, authToken);

// Function to generate OTP (for demo purposes)



exports.forgotPassword = async (req, res) => {
  const { emailOrPhone } = req.body;

  try {
    // Find user by email or phone
    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP and set expiration
    const otp = generateOTP();
    user.resetOtp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;  // OTP valid for 10 minutes
    await user.save();

    // Prepare response messages
    let emailSent = false;
    let smsSent = false;

    // Send OTP via email
    if (user.email && user.email === emailOrPhone) {
      try {
        await sendEmail(user.email, 'Your OTP Code', `Your OTP is ${otp}`);
        emailSent = true;
      } catch (err) {
        console.error('Email sending failed:', err.message);
      }
    }

    // Send OTP via SMS using Twilio
    if (user.phone && user.phone === emailOrPhone) {
      try {
        await client.messages.create({
          body: `Your OTP is ${otp}`,
          from: twilioPhoneNumber,
          to: user.phone  // User's phone number
        });
        smsSent = true;
      } catch (err) {
        console.error('SMS sending failed:', err.message);
      }
    }

    // Respond with success if either email or SMS was successful
    if (emailSent || smsSent) {
      return res.json({
        message: `OTP sent to your ${emailSent ? 'email' : ''}${emailSent && smsSent ? ' and ' : ''}${smsSent ? 'phone' : ''}.`
      });
    } else {
      return res.status(500).json({ message: 'Failed to send OTP' });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to process OTP request', error: error.message });
  }
};
// Reset Password - Verify OTP and Reset Password
exports.resetPassword = async (req, res) => {
  const { emailOrPhone, otp, newPassword } = req.body;

  try {
    // Find the user by email/phone and OTP, ensure OTP is valid and not expired
    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
      resetOtp: otp,
      otpExpires: { $gt: Date.now() }, // Check OTP expiration
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid OTP or OTP expired' });
    }

    // Update the user's password and clear OTP data
    user.password = newPassword; // Ensure the password is hashed in the User model
    user.resetOtp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reset password', error: error.message });
  }
};
