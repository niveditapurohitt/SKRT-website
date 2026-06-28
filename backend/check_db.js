const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('❌ MONGODB_URI is not set in backend/.env');
  process.exit(1);
}

mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 })
  .then(async () => {
    const db = mongoose.connection.db;
    const [shipments, contacts, users] = await Promise.all([
      db.collection('shipments').countDocuments(),
      db.collection('contacts').countDocuments(),
      db.collection('users').countDocuments()
    ]);

    console.log(JSON.stringify({
      database: db.databaseName,
      shipments,
      contacts,
      users
    }, null, 2));

    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
