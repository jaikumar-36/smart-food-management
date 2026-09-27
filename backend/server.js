require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/health', (_, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected'
  });
});

const userSchema = new mongoose.Schema({ name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: 'student' } }, { timestamps: true });
const menuSchema = new mongoose.Schema({ date: String, mealType: String, foodItems: [String], estimatedQuantity: Number });
const preferenceSchema = new mongoose.Schema({ studentId: String, date: String, mealType: String, preference: String }, { timestamps: true });
const consumptionSchema = new mongoose.Schema({ date: String, mealType: String, foodItem: String, preparedQuantity: Number, consumedQuantity: Number });
const wasteSchema = new mongoose.Schema({ date: String, mealType: String, foodItem: String, preparedQuantity: Number, consumedQuantity: Number, leftoverQuantity: Number, reason: String }, { timestamps: true });
const User = mongoose.model('User', userSchema);
const Menu = mongoose.model('Menu', menuSchema);
const Preference = mongoose.model('Preference', preferenceSchema);
const Consumption = mongoose.model('Consumption', consumptionSchema);
const Waste = mongoose.model('Waste', wasteSchema);
const ngoSchema = new mongoose.Schema({ name: String, location: String, contactPerson: String, contactEmail: String, contactPhone: String, acceptedFoodTypes: [String], capacity: Number, pickupAvailable: Boolean, status: { type: String, default: 'Available' } });
const donationSchema = new mongoose.Schema({ foodItem: String, mealType: String, quantity: Number, preparationTime: String, expiryTime: String, pickupLocation: String, ngoId: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO' }, status: { type: String, default: 'Pending' }, requestedAt: { type: Date, default: Date.now }, acceptedAt: Date, collectedAt: Date, notes: String });
const NGO = mongoose.model('NGO', ngoSchema);
const Donation = mongoose.model('Donation', donationSchema);
const today = () => new Date().toISOString().slice(0, 10);

function token(user) { return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'demo_secret', { expiresIn: '7d' }); }
function auth(req, res, next) { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET || 'demo_secret'); next(); } catch { res.status(401).json({ message: 'Please log in.' }); } }

app.post('/api/auth/register', async (req, res) => {
  try { const { name, email, password } = req.body; const role = 'student'; const user = await User.create({ name, email, password: await bcrypt.hash(password, 10), role }); res.status(201).json({ token: token(user), user: { id: user._id, name, email, role } }); }
  catch { res.status(400).json({ message: 'This email is already registered.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(401).json({ message: 'Invalid email or password.' });
  res.json({ token: token(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});
app.get('/api/students', async (_, res) => res.json(await User.find({ role: 'student' }).select('-password')));
app.get('/api/students/:id', async (req, res) => res.json(await User.findById(req.params.id).select('-password')));

app.get('/api/menu', async (req, res) => res.json(await Menu.find(req.query.date ? { date: req.query.date } : {}).sort('mealType')));
app.post('/api/menu', auth, async (req, res) => res.status(201).json(await Menu.create(req.body)));
app.put('/api/menu/:id', auth, async (req, res) => res.json(await Menu.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.delete('/api/menu/:id', auth, async (req, res) => { await Menu.findByIdAndDelete(req.params.id); res.json({ message: 'Meal deleted.' }); });

app.post('/api/preferences', auth, async (req, res) => {
  const data = { ...req.body, studentId: req.user.id, date: req.body.date || today() };
  res.json(await Preference.findOneAndUpdate({ studentId: data.studentId, date: data.date, mealType: data.mealType }, data, { upsert: true, new: true }));
});
app.get('/api/preferences', auth, async (_, res) => res.json(await Preference.find()));
app.get('/api/preferences/today', async (_, res) => res.json(await Preference.find({ date: today() })));
app.post('/api/consumption', auth, async (req, res) => res.status(201).json(await Consumption.create(req.body)));
app.get('/api/consumption', async (_, res) => res.json(await Consumption.find().sort({ date: -1 })));
app.get('/api/consumption/today', async (_, res) => res.json(await Consumption.find({ date: today() })));
app.post('/api/waste', auth, async (req, res) => res.status(201).json(await Waste.create(req.body)));
app.get('/api/waste', async (req, res) => res.json(await Waste.find(req.query).sort({ date: -1 })));
app.get('/api/waste/summary', async (_, res) => { const data = await Waste.aggregate([{ $group: { _id: '$foodItem', leftover: { $sum: '$leftoverQuantity' } } }, { $sort: { leftover: -1 } }]); res.json(data); });
app.get('/api/ngos', async (_, res) => res.json(await NGO.find()));
app.get('/api/ngos/:id', async (req, res) => res.json(await NGO.findById(req.params.id)));
app.post('/api/ngos', auth, async (req, res) => res.status(201).json(await NGO.create(req.body)));
app.put('/api/ngos/:id', auth, async (req, res) => res.json(await NGO.findByIdAndUpdate(req.params.id, req.body, { new: true })));
app.post('/api/donations', auth, async (req, res) => {
  if (!req.body.foodSafetyConfirmed) return res.status(400).json({ message: 'Food-safety confirmation is required.' });

  try {
    const donation = await Donation.create(req.body);
    const donationEvent = {
      event: 'donation.created',
      donation: {
        id: donation._id.toString(),
        foodItem: donation.foodItem,
        mealType: donation.mealType,
        quantity: donation.quantity,
        preparationTime: donation.preparationTime,
        expiryTime: donation.expiryTime,
        pickupLocation: donation.pickupLocation,
        ngoId: donation.ngoId ? donation.ngoId.toString() : null,
        status: donation.status,
        requestedAt: donation.requestedAt,
        notes: donation.notes
      },
      donor: { id: req.user.id, role: req.user.role }
    };

    let webhookNotified = false;
    if (!process.env.N8N_WEBHOOK_URL) {
      console.error('n8n donation webhook was not sent: N8N_WEBHOOK_URL is not configured.');
    } else {
      try {
        await axios.post(process.env.N8N_WEBHOOK_URL, donationEvent, { timeout: 10000 });
        webhookNotified = true;
      } catch (error) {
        console.error(`n8n donation webhook failed for donation ${donation._id}: ${error.message}`);
      }
    }

    res.status(201).json({ donation, automation: { webhookNotified } });
  } catch (error) {
    console.error(`Donation creation failed: ${error.message}`);
    res.status(500).json({ message: 'Unable to create the donation request. Please try again.' });
  }
});
app.get('/api/donations', async (_, res) => res.json(await Donation.find().populate('ngoId').sort({ requestedAt: -1 })));
app.get('/api/donations/history', async (_, res) => res.json(await Donation.find({ status: { $in: ['Collected', 'Expired', 'Rejected'] } }).populate('ngoId').sort({ requestedAt: -1 })));
app.get('/api/donations/summary', async (_, res) => { const all = await Donation.find(); const completed = all.filter(d => d.status === 'Collected'); res.json({ available: all.filter(d => ['Pending','Accepted'].includes(d.status)).reduce((n,d) => n+d.quantity, 0), requested: all.length, completed: completed.length, mealsDonated: completed.reduce((n,d) => n+d.quantity, 0), foodSaved: completed.reduce((n,d) => n+d.quantity, 0) }); });
app.get('/api/donations/:id', async (req, res) => res.json(await Donation.findById(req.params.id).populate('ngoId')));
app.put('/api/donations/:id/status', auth, async (req, res) => { const updates = { status: req.body.status }; if (req.body.status === 'Accepted') updates.acceptedAt = new Date(); if (req.body.status === 'Collected') updates.collectedAt = new Date(); res.json(await Donation.findByIdAndUpdate(req.params.id, updates, { new: true })); });

app.get('/api/dashboard', async (_, res) => {
  const [students, preferences, records, wastes] = await Promise.all([User.countDocuments({ role: 'student' }), Preference.find({ date: today() }), Consumption.find({ date: today() }), Waste.find({ date: today() })]);
  const attending = preferences.filter(p => p.preference === 'attending').length;
  const maybe = preferences.filter(p => p.preference === 'maybe').length;
  const expectedMeals = attending + Math.ceil(maybe * .5) + 8;
  const preparedMeals = records.reduce((n, r) => n + r.preparedQuantity, 0);
  const consumedMeals = records.reduce((n, r) => n + r.consumedQuantity, 0);
  const foodWaste = wastes.reduce((n, w) => n + w.leftoverQuantity, 0) || Math.max(preparedMeals - consumedMeals, 0);
  const donationSuggestion = foodWaste > 0 ? `${foodWaste} meals of suitable, in-date excess food may be considered for donation after an administrator confirms applicable food-safety requirements.` : 'No excess food is currently recorded for donation.';
  res.json({ totalStudents: students || 200, confirmedAttendance: attending || 165, maybe, expectedMeals: expectedMeals || 173, preparedMeals: preparedMeals || 175, consumedMeals: consumedMeals || 158, foodWaste: foodWaste || 17, weeklyWaste: 82, donationSuggestion });
});
app.get('/api/dashboard/weekly', async (_, res) => res.json({ labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], prepared: [168,176,170,182,175,165,175], consumed: [155,162,159,168,158,151,158], waste: [13,14,11,14,17,14,17], popular: [{ name:'Rajma Rice', value:42 },{ name:'Vegetable Pulao', value:31 },{ name:'Dal Rice', value:21 }] }));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));

const production = process.env.NODE_ENV === 'production';
if (production && !process.env.MONGODB_URI) {
  console.error('MONGODB_URI must be configured in production.');
  process.exit(1);
}
if (production && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be configured in production.');
  process.exit(1);
}

const port = Number(process.env.PORT) || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_food_manager', {
  serverSelectionTimeoutMS: 10000
}).then(() => app.listen(port, '0.0.0.0', () => {
  console.log(`Smart Food Manager listening on port ${port}`);
})).catch(err => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});
