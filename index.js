const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const { isValidObjectId } = require('mongoose');
const SECRET = process.env.JWT_SECRET

const cron = require('node-cron');  

const port = process.env.PORT || 3000
const multer = require("multer");
const path = require("path");
const { Console } = require('console');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });


// Middleware
app.set('view engine', 'ejs');
app.use(express.json()) 
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET);
      req.user = decoded;
      res.locals.user = decoded;
    } catch (err) {
      req.user = null;
      res.locals.user = null;
    }
  } else {
    req.user = null;
    res.locals.user = null;
  }
  next();
});



function authMiddlewareOptional(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    req.user = null; // No user logged in
    return next();
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = null; // Invalid token, still allow page load
    next();
  }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err))

// Court model 
const Court = mongoose.model('Court', {
  
  name: String,
  location: String,
  pricePerHour: Number,
  images:[String],
  owner:{type:mongoose.Schema.Types.ObjectId,ref:"User"}
  

})
//User model
const User=mongoose.model('User',{
   
  phonenumber:String,
  name:String,
   email: {type:String, unique:true, required:true},
   password:String, 
   role:{type:String, default:"User" }
})

const Booking=mongoose.model('Booking',{
  user:{type: mongoose.Schema.Types.ObjectId, ref:"User"},
  court:{type: mongoose.Schema.Types.ObjectId, ref:"Court"},
   slot: { type: mongoose.Schema.Types.ObjectId, ref: "Slot" },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['active', 'canceled', 'expired'], default: 'active' },  // New: Track status
  canceledBy: { type: String, enum: ['user', 'owner'], default: null },  // New: Who canceled it
  
});


const Slot = mongoose.model("Slot",{
  court: { type: mongoose.Schema.Types.ObjectId, ref: "Court" },
  date: { type: Date, required: true },
  startTime: String,
  endTime: String,
  price: Number,
  isBooked: { type: Boolean, default: false },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
});
const Rating = mongoose.model('Rating', {
  court: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});





app.get('/', (req, res) => {
  res.render('home'); 
});


// COURTS
// Get all courts
app.get("/courts", authMiddleware, async (req, res) => {
  try {
    const courts = await Court.find();
    res.render("court", { courts, user: req.user });
  } catch (err) {
    console.error("❌ Courts fetch error:", err);
    res.status(500).render("error", { message: "Unable to load courts." });
  }
});

// Add a new court 
app.get("/courts/new", authMiddleware, adminOrOwnerOnly, (req, res) => {
  res.render("add-courts");
});

app.post("/courts/new", authMiddleware, adminOrOwnerOnly, async (req, res) => {
  const { name, location, pricePerHour } = req.body;

  const court = new Court({
    name,
    location,
    pricePerHour,
    owner: req.user.id  // save who created it
  });

  await court.save();
  res.redirect("/courts");
});



// Updated /courts/:id route
app.get("/courts/:id", authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).render("error", { message: "Invalid court ID. Please check the URL." });
    }
    
    // Fetch the court (no ratings here anymore)
    const court = await Court.findById(id).exec();
    
    if (!court) {
      return res.status(404).render("error", { message: "Court not found" });
    }
    
    // Fetch and populate ratings for this court
    const ratings = await Rating.find({ court: id })
      .populate('user', 'name')  // Populate user with name
      .sort({ createdAt: -1 })  // Optional: Sort by newest first
      .exec();
    
    // Slots logic remains the same
    let slots = [];
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      
      slots = await Slot.find({
        court: id,
        date: { $gte: today, $lte: endOfToday },
      }).sort("startTime");
      
      console.log(`Fetched slots for court ${id}:`, slots);
    } catch (slotError) {
      console.error("Error fetching slots:", slotError);
    }
    
    // Calculate average rating from the fetched ratings
    const averageRating = calculateAverageRating(ratings);  // Update this function to accept ratings array
    
    // Render with ratings array
    res.render("court-details", { court, slots, ratings, user: req.user, averageRating });
  } catch (err) {
    console.error("Court detail error:", err);
    next(err);
  }
});


// ... (rest of your code continues)


app.get("/courts/:id/slots", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "Date required" });

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const slots = await Slot.find({
      court: req.params.id,
      date: { $gte: start, $lte: end },
    }).sort("startTime");

    res.json(slots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/courts/:id/book/:slotId", authMiddleware, async (req, res, next) => {
  try {
    // 1️⃣ Fetch slot and court
    const slot = await Slot.findById(req.params.slotId).populate("court");
    if (!slot || slot.isBooked) {
      return res.status(400).render("error", { message: "Slot not available" });
    }

    // 2️⃣ Mark as booked
    slot.isBooked = true;
    slot.bookedBy = req.user.id;
    await slot.save();

    // 3️⃣ Create a Booking record
    const booking = new Booking({
      user: req.user.id,
      court: slot.court._id,
      slot: slot._id,
    });
    await booking.save();

    // 4️⃣ Generate receipt page
    res.render("receipt", {
      user: req.user,
      court: slot.court,
      slot,
      booking,
      message: "Booking confirmed successfully!",
    });
  } catch (err) {
    console.error("❌ Booking error:", err);
    next(err);
  }
});
// Route to handle GET /receipt/:id
app.get('/receipt/:id', async (req, res) => {
  try {
    const bookingId = req.params.id;
    // Fetch the booking and populate related fields
    const booking = await Booking.findById(bookingId)
      .populate('court')  // Assuming 'court' is a reference in your Booking model
      .populate('user')
       .populate('slot'); ;  // Assuming 'user' is a reference in your Booking model

    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    // Pass variables in the format the template expects
    res.render('receipt', {
      booking,        // For booking._id
      court: booking.court,  // For court.name, court.location
      slot: booking.slot,   // For slot.startTime, slot.endTime, slot.date, slot.price
      user: booking.user    // For user.name
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});


app.post(
  "/courts/:id/upload",
  authMiddleware,
  async (req, res, next) => {
    const court = await Court.findById(req.params.id);
    if (!court) return res.status(404).render("error", { message: "Court not found" });

    // Check permission: only owner or admin
    if (req.user.role !== "Admin" && court.owner.toString() !== req.user.id) {
      return res.status(403).render("error", { message: "You can only upload to your own courts." });
    }

    next();
  },
  upload.array("images", 5), // up to 5 images
  async (req, res) => {
    const court = await Court.findById(req.params.id);
    const imagePaths = req.files.map(f => "/uploads/" + f.filename);
    court.images.push(...imagePaths);
    await court.save();

    res.redirect(`/courts/${court._id}`);
  }
);



app.get('/user/login', (req, res) => {
  res.render("Login");  // make login.ejs with email + password form
});

app.post('/user/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.send("❌ User not found");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.send("❌ Invalid password");

  // create token
  const token = jwt.sign(
    { id: user._id, role: user.role },
    SECRET,
    { expiresIn: "1h" }
  );

  // store in cookie
  res.cookie("token", token, {
  httpOnly: true,
  secure: true,      // ensures cookie only over HTTPS
  sameSite: "strict" // blocks CSRF
});

  res.redirect("/courts");
});

//Add a new user
app.get("/user/register", (req, res) => {
  res.render("register");
});
app.post('/user/register', async (req, res) => {
  const { name, phonenumber, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({ name, phonenumber, email, password: hashedPassword });
  await user.save();

  res.redirect('/user/login'); // go to login after registering
});
app.post("/history/:id/rate", authMiddleware, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const courtId = req.params.id;

    // Check if user is authenticated and has an id
    if (!req.user || !req.user.id) {
      return res.status(401).render("error", { message: "You must be logged in to rate." });
    }

    // Check if the court exists
    const court = await Court.findById(courtId);
    if (!court) {
      return res.status(404).render("error", { message: "Court not found" });
    }

    // Remove any existing rating by this user for this court
    await Rating.deleteMany({ court: courtId, user: req.user.id });

    // Create and save the new rating
    const newRating = new Rating({
      court: courtId,
      user: req.user.id,  // Changed from req.user._id to req.user.id
      rating: parseInt(rating),
      comment: comment || ""
    });
    await newRating.save();

    res.redirect(`/courts/${courtId}`);
  } catch (err) {
    console.error("❌ Rating error:", err);
    res.status(500).render("error", { message: "Error submitting rating." });
  }
});
app.get('/history', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("court")
      .populate("slot")
      .populate("user")
      .sort({ createdAt: -1 });  // Sort by newest first

    // For each booking, check if the user has already rated the court
    for (let b of bookings) {
      if (b.court) {
        const existingRating = await Rating.findOne({ court: b.court._id, user: req.user.id });
        b.hasRated = !!existingRating;  // Set flag to true if rating exists
      } else {
        b.hasRated = false;  // No court, so can't rate
      }
    }

    res.render("history", { bookings });  // New template: history.ejs
  } catch (error) {
    console.error("❌ Error fetching history:", error);
    res.status(500).render("error", { message: "Error loading history." });
  }
});



app.get('/booking', authMiddleware, async (req, res) => {
  try {
    // Filter to only active bookings (excludes canceled/expired)
    const bookings = await Booking.find({ user: req.user.id, status: 'active' })  // ✅ Added status filter
      .populate("court")
      .populate("slot")  // ✅ Added: Populate slot for date/startTime/endTime in template
      .populate("user");  // Optional: If you need user details in the template

    res.render("booking", { bookings });
  } catch (error) {
    console.error("❌ Error fetching bookings:", error);
    res.status(500).render("error", { message: "Error loading bookings." });
  }
});
app.post("/bookings/:id/cancel", authMiddleware, async (req, res) => {  // Changed from /delete to /cancel
  try {
    const booking = await Booking.findById(req.params.id)
      .populate({
        path: "slot",
        populate: { path: "court", model: "Court" },
      })
      .populate("user");

    if (!booking) {
      return res.status(404).render("error", { message: "Booking not found." });
    }

    const user = req.user;
    const isOwner = user.role === "Owner";
    const isAdmin = user.role === "Admin";

    // Allow: user owns the booking OR owner owns the court OR admin
    const ownsBooking = booking.user._id.toString() === user.id;
    const ownsCourt = booking.slot.court.owner?.toString() === user.id;

    if (!ownsBooking && !ownsCourt && !isAdmin) {
      return res.status(403).render("error", { message: "Unauthorized action." });
    }

    const now = new Date();
    const slotDate = new Date(booking.slot.date);

    // Optional: Prevent canceling past/same-day bookings (only for normal users)
    if (!isAdmin && !isOwner && slotDate <= now) {
      return res
        .status(400)
        .render("error", { message: "You can’t cancel a past or same-day booking." });
    }

    // Free up the slot (unchanged)
    const slot = await Slot.findById(booking.slot._id);
    slot.isBooked = false;
    slot.bookedBy = null;
    await slot.save();

    // NEW: Update booking status instead of deleting
    booking.status = 'canceled';
    booking.canceledBy = ownsBooking ? 'user' : 'owner';  // Mark who canceled it
    await booking.save();  // Save the updated booking

    console.log(
      `🚫 Booking canceled by ${user.email} (${user.role}) for ${booking.slot.court.name}. Status: ${booking.status}, Canceled by: ${booking.canceledBy}`
    );

    // Redirect based on role (unchanged)
    if (isOwner || isAdmin) {
      res.redirect("/owner/bookings"); // You can change this route if needed
    } else {
      res.redirect("/history");  // Assumes you have a /history route for user history
    }
  } catch (err) {
    console.error("❌ Cancel booking error:", err);
    res.status(500).render("error", { message: "Error canceling booking." });
  }
});


// Manual route to trigger expiration (optional)
app.post('/bookings/expire', async (req, res) => {
  try {
    const now = new Date();
    // Find active bookings where slot.endTime has passed
    const expiredBookings = await Booking.find({ status: 'active' })
      .populate('slot')
      .then(bookings => bookings.filter(b => new Date(`${b.slot.date}T${b.slot.endTime}`) < now));

    // Update them to expired
    await Booking.updateMany(
      { _id: { $in: expiredBookings.map(b => b._id) } },
      { status: 'expired' }
    );

    // Optionally, free up slots
    for (const booking of expiredBookings) {
      await Slot.findByIdAndUpdate(booking.slot._id, { isBooked: false, bookedBy: null });
    }

    res.json({ message: `${expiredBookings.length} bookings expired` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cron job to run every hour (adjust as needed)
cron.schedule('0 * * * *', async () => {  // Every hour at minute 0
  console.log('Running expiration check...');
  // Call the expiration logic here (same as above)
  const now = new Date();
  const expiredBookings = await Booking.find({ status: 'active' })
    .populate('slot')
    .then(bookings => bookings.filter(b => new Date(`${b.slot.date}T${b.slot.endTime}`) < now));
  await Booking.updateMany(
    { _id: { $in: expiredBookings.map(b => b._id) } },
    { status: 'expired' }
  );
  for (const booking of expiredBookings) {
    await Slot.findByIdAndUpdate(booking.slot._id, { isBooked: false, bookedBy: null });
  }
  console.log(`${expiredBookings.length} bookings expired`);
});

app.get("/user/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

function errorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(500).render("error", { message: "Something went wrong!" });}

app.use(errorHandler);
function adminOrOwnerOnly(req, res, next) {
  if (req.user.role === "Admin" || req.user.role === "Owner") {
    return next();
  }
  return res.status(403).send("Access denied: Only Admins or Court Owners can perform this action.");
}

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/user/login");

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // now req.user = { id, role, iat, exp }
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err);
    res.redirect("/user/login");
  }
}
function calculateAverageRating(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  return (sum / ratings.length).toFixed(1);
}
// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
