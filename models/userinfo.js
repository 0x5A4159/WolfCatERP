const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const userSchema = new Schema({
    userName: { type: String, required: true },
    userPass: {type:String, requireed: true},
    userRole: { type: Number, required: true },
    userID: { type: Number, required: true },
    userEmail: { type: String, required: true },
    userSession: { type: Object, required: false },
    userCreated: { type: Date, required: true },
    userAvatar: { type: String, required: false },
    userPronouns: { type: String, required: false },
    userStatus: {type: String, required:false}
}, { versionKey: false });

const User = mongoose.model('User', userSchema);

module.exports = User;