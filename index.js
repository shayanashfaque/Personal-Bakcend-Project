const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");

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
  res.locals.user = req.user ||null; // EJS now always has user available
  next();
});
app.use((req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET);
      res.locals.user = decoded;
      req.user = decoded;
    } catch (err) {
      res.locals.user = null;
    }
  } else {
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
  available: { type: Boolean, default: true },
  image:[String],
  owner:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
 slots: [
  {
    startTime: String,
    endTime: String,
    price: Number,
    isBooked: { type: Boolean, default: false },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  }
]

})
//User model
const User=mongoose.model('User',{
   
  phonenumber:String,
  name:String,
   email: String,
   password:String, 
   role:{type:String, default:"User" }
})

const Booking=mongoose.model('Booking',{
  user:{type: mongoose.Schema.Types.ObjectId, ref:"User"},
  court:{type: mongoose.Schema.Types.ObjectId, ref:"Court"},
  date:Date,
  startTime:String,
  endTime: String
})

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

app.get("/courts/:id", authMiddleware, async (req, res, next) => {
  try {
    const court = await Court.findById(req.params.id);
    if (!court) return res.status(404).render("error", { message: "Court not found" });
    res.render("court-details", { court, user: req.user });
  } catch (err) {
    console.error("Court detail error:", err);
    next(err);
  }
});
app.post("/courts/:courtId/book/:slotId", authMiddleware, async (req, res, next) => {
  try {
    const court = await Court.findById(req.params.courtId);
    if (!court) return res.status(404).render("error", { message: "Court not found" });

    const slot = court.slots.id(req.params.slotId);
    if (!slot) return res.status(404).render("error", { message: "Slot not found" });
    if (slot.isBooked) return res.status(400).render("error", { message: "Slot already booked" });

    // Mark slot as booked
    slot.isBooked = true;
    slot.bookedBy = req.user.id;
    await court.save();

    // Optionally create a Booking document
    const booking = new Booking({
      user: req.user.id,
      court: court._id,
      date: new Date(),
      startTime: slot.startTime,
      endTime: slot.endTime,
    });
    await booking.save();

    // Mock payment success
    res.render("receipt", { user: req.user, court, slot });
  } catch (err) {
    console.error("Booking error:", err);
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

app.use((req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    try {
      res.locals.user = jwt.verify(token, SECRET);
    } catch {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});


// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
