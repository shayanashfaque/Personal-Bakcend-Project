const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const { isValidObjectId } = require('mongoose');
const SECRET = process.env.JWT_SECRET


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
  owner:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  ratings: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],

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
  createdAt: { type: Date, default: Date.now }
})
const Slot = mongoose.model("Slot",{
  court: { type: mongoose.Schema.Types.ObjectId, ref: "Court" },
  date: { type: Date, required: true },
  startTime: String,
  endTime: String,
  price: Number,
  isBooked: { type: Boolean, default: false },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
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
    
    const court = await Court.findById(id);
    if (!court) {
      return res.status(404).render("error", { message: "Court not found" });
    }
    
    let slots = [];  // Default to an empty array
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);
      
      slots = await Slot.find({
        court: id,
        date: { $gte: today, $lte: endOfToday },
      }).sort("startTime");
      
      console.log(`Fetched slots for court ${id}:`, slots);  // Debugging log
    } catch (slotError) {
      console.error("Error fetching slots:", slotError);
    }
    
    // Calculate average rating
    const averageRating = calculateAverageRating(court.ratings);
    
    // Render the template with all variables
    res.render("court-details", { court, slots, user: req.user, averageRating });
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
app.post("/courts/:id/rate", authMiddleware, async (req, res) => {
  const { rating, comment } = req.body;
  const court = await Court.findById(req.params.id);

  if (!court) return res.status(404).render("error", { message: "Court not found" });

  // Prevent double-rating
  const existing = court.ratings.find(r => r.user.toString() === req.user._id.toString());
  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
  } else {
    court.ratings.push({ user: req.user._id, rating, comment });
  }

  await court.save();
  res.redirect("/courts");
});

app.get("/history", authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("court")
      .populate("slot");

    // Example logic: show only past slots (before now)
    const now = new Date();
    const pastBookings = bookings.filter(
      b => new Date(b.slot.date).getTime() < now.getTime()
    );

    res.render("history", { bookings: pastBookings, user: req.user });
  } catch (err) {
    console.error("❌ History fetch error:", err);
    res.status(500).render("error", { message: "Unable to load history." });
  }
});


app.get('/booking', authMiddleware, async (req, res) => {
  const bookings = await Booking.find({ user: req.user.id })
    .populate("court"); // no need to populate user here, it’s always the logged-in one

  res.render("booking", { bookings });
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
const calculateAverageRating = (ratings) => {
  if (!ratings || ratings.length === 0) {
    return 0; // Return 0 if no ratings
  }
  const total = ratings.reduce((sum, r) => sum + r.rating, 0);
  return (total / ratings.length).toFixed(1); // Return as a string with 1 decimal place
};

// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
