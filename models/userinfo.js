const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const userSchema = new Schema({
    userName: { type: String, required: true },
    userSession: { type: String, required: true },
    userRole: { type: Number, required: true },
    userID: { type: Number, required: true },
    userEmail: {type: String, required: true}
});

const User = mongoose.model('User', userSchema);

module.exports = User;