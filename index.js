const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");

const SECRET = process.env.JWT_SECRET
// Port
const port = process.env.PORT || 3000

// Middleware
app.set('view engine', 'ejs');
app.use(express.json()) 
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cookieParser());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err))

// Court model 
const Court = mongoose.model('Court', {
  court_id: Number,
  name: String,
  location: String,
  pricePerHour: Number,
  available: { type: Boolean, default: true }
})
//User model
const User=mongoose.model('User',{
  user_id:Number, 
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
app.get('/courts', async (req, res) => {
  const courts = await Court.find()
  res.render('court',{courts})
})

// Add a new court 
app.get("/courts/new", authMiddleware, adminOnly, (req, res) => {
  res.render("add-courts");
});

app.post("/courts/new", authMiddleware, adminOnly, async (req, res) => {
  const { name, location, pricePerHour } = req.body;
  const court = new Court({ name, location, pricePerHour });
  await court.save();
  res.redirect("/courts");
});

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
  res.cookie("token", token, { httpOnly: true });
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


app.get('/booking/new/:courtId', authMiddleware, async (req, res) => {
  const court = await Court.findById(req.params.courtId);
  res.render("add-booking", { court });
});

app.post('/booking/new', authMiddleware, async (req, res) => {
  const { court, date, startTime, endTime } = req.body;

  const booking = new Booking({
    user: req.user.id,   // from JWT
    court,
    date,
    startTime,
    endTime
  });

  await booking.save();
  res.redirect('/booking');
});

app.get("/user/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

function errorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(500).render("error", { message: "Something went wrong!" });
}

app.use(errorHandler);
function adminOnly(req, res, next) {
  if (req.user.role !== "Admin") {
    return res.status(403).send("Access denied");
  }
  next();
}




// Test route: user info
app.get('/user', (req,res) => {
  res.json({
    name: "Shayan",
    age: 24,
    role: "Developer"
  })
})

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.redirect("/user/login");

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.redirect("/user/login");
  }
}


// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
