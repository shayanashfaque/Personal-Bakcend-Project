// seed.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config();

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ----------------------
// Schemas
// ----------------------
const User = mongoose.model("User", {
  phonenumber: String,
  name: String,
  email: String,
  password: String,
  role: { type: String, default: "User" }
});

const Court = mongoose.model("Court", {
  name: String,
  location: String,
  pricePerHour: Number,
  available: { type: Boolean, default: true },
  images: { type: [String], default: [] },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
});

// ----------------------
// Seed Function
// ----------------------
async function seed() {
  try {
    // 1️⃣ Clear old users and courts
    await User.deleteMany();
    await Court.deleteMany();
    console.log("🗑️ Cleared old users and courts");

    // 2️⃣ Create demo admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const adminUser = new User({
      name: "Admin Demo",
      phonenumber: "0000000000",
      email: "admin@example.com",
      password: hashedPassword,
      role: "Admin"
    });
    await adminUser.save();
    console.log("✅ Demo admin user created:", adminUser.email);

    // 3️⃣ Seed demo courts with admin as owner
    const courtsData = [
      { name: "City Arena", location: "Downtown", pricePerHour: 50, images: [], owner: adminUser._id },
      { name: "East Side Pitch", location: "East District", pricePerHour: 40, images: [], owner: adminUser._id },
      { name: "West Turf", location: "West End", pricePerHour: 60, images: [], owner: adminUser._id },
    ];

    await Court.insertMany(courtsData);
    console.log("✅ Demo courts added with admin as owner");

  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    mongoose.disconnect();
  }
}

seed();
