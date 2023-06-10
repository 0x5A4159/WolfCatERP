const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const taskSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true},
    complete: { type: Boolean, required: true },
    createdate: {type: Date, required:true}
}, {versionKey: false});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;