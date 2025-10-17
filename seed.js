const mongoose = require("mongoose");
require("dotenv").config();

// ===== Models =====
const User = mongoose.model("User", {
  phonenumber: String,
  name: String,
  email: String,
  password: String,
  role: { type: String, default: "User" },
});

const Court = mongoose.model("Court", {
  name: String,
  location: String,
  pricePerHour: Number,
  images: [String],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

const Slot = mongoose.model("Slot", {
  court: { type: mongoose.Schema.Types.ObjectId, ref: "Court" },
  date: { type: Date, required: true },
  startTime: String,
  endTime: String,
  price: Number,
  isBooked: { type: Boolean, default: false },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
});

// ===== Seeder =====
(async () => {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected to MongoDB");

    // Clear old data
    await Promise.all([Court.deleteMany({}), Slot.deleteMany({})]);
    console.log("🧹 Old courts and slots cleared.");

    // Ensure at least one Owner exists
    let owners = await User.find({ role: "Owner" });
    if (owners.length === 0) {
      console.log("⚠️ No owners found — creating a mock Owner user...");
      const defaultOwner = await User.create({
        name: "Mock Owner",
        email: "mockowner@example.com",
        phonenumber: "0000000000",
        password: "mockpassword",
        role: "Owner",
      });
      owners = [defaultOwner];
      console.log(`✅ Created default owner: ${defaultOwner.email}`);
    }

    // Courts (no manual _id!)
    const courtData = [
      { name: "Sunset Arena", location: "Los Angeles, CA", pricePerHour: 50, images: ["sunset1.jpg", "sunset2.jpg"], owner: owners[0]._id },
      { name: "Downtown Sports Hub", location: "New York, NY", pricePerHour: 70, images: ["downtown1.jpg", "downtown2.jpg"], owner: owners[0]._id },
      { name: "Palm Court", location: "Miami, FL", pricePerHour: 60, images: ["palm1.jpg"], owner: owners[0]._id },
      { name: "Greenwood Arena", location: "Seattle, WA", pricePerHour: 55, images: ["greenwood.jpg"], owner: owners[0]._id },
      { name: "Highpoint Courts", location: "Denver, CO", pricePerHour: 65, images: ["highpoint1.jpg", "highpoint2.jpg"], owner: owners[0]._id },
    ];

    const courts = await Court.insertMany(courtData);
    console.log(`✅ Inserted ${courts.length} courts.`);

    // Slots (7 days × 5 slots per day per court)
    const slotTimes = [
      { startTime: "08:00", endTime: "09:00" },
      { startTime: "09:00", endTime: "10:00" },
      { startTime: "10:00", endTime: "11:00" },
      { startTime: "11:00", endTime: "12:00" },
      { startTime: "12:00", endTime: "13:00" },
    ];

    const today = new Date();
    const slotsToInsert = [];

    courts.forEach((court) => {
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const date = new Date(today);
        date.setDate(today.getDate() + dayOffset);

        slotTimes.forEach((t) => {
          slotsToInsert.push({
            court: court._id,
            date,
            startTime: t.startTime,
            endTime: t.endTime,
            price: court.pricePerHour,
          });
        });
      }
    });

    const slots = await Slot.insertMany(slotsToInsert);
    console.log(`✅ Inserted ${slots.length} slots (${courts.length * 35} total expected).`);

    console.log("🎉 Mock owner, courts, and slots generated successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding data:", err.message);
    process.exit(1);
  }
})();
