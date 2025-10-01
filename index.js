const mongoose = require('mongoose')
require('dotenv').config()
const express = require('express')
const app = express()

// Port
const port = process.env.PORT || 3000

// Middleware
app.set('view engine', 'ejs');
app.use(express.json()) 
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));


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
app.get("/courts/new", (req, res) => {
  res.render("add-courts");
});
app.post('/courts/new', async (req, res) => {
  const { name, location, pricePerHour } = req.body
  const court = new Court({ name, location, pricePerHour })
  await court.save()
  res.redirect('/courts')
})
//Add a new user
app.get("/user/register", (req, res) => {
  res.render("register");
});
app.post('/user/register', async (req, res)=>{
  const { name,phonenumber,email, password}=req.body
  const user=new User({name,phonenumber,email,password})
  await user.save()
  res.redirect('/')

})
app.get('/booking', async (req, res) => {
  const bookings = await Booking.find()
    .populate("user")
    .populate("court");

  res.render("booking", { bookings });
});


app.get("/booking/new", async (req, res) => {
  const courtId = req.query.courtId;
  let court = null;

  if (courtId) {
    court = await Court.findById(courtId);
  }

  if (!court) {
    return res.send("❌ Please select a court first.");
  }

  res.render("add-booking", { court });
});



app.post('/booking/new', async (req, res) => {
  const { user, court, date, startTime, endTime } = req.body;

  const booking = new Booking({
    user,      
    court,     
    date,
    startTime,
    endTime
  });

  await booking.save();
  res.redirect('/booking'); 
});





// Test route: user info
app.get('/user', (req,res) => {
  res.json({
    name: "Shayan",
    age: 24,
    role: "Developer"
  })
})



// ---------------------
// Start Server
// ---------------------
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`)
})
