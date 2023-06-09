const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const taskSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true},
    complete: { type: Boolean, required: true },
    createdate: { type: Date, required: true },
    createdby: { type: String, required: true },
    onlyCreator: { type: Boolean, required: true },
    lastEdited: {type: String, required: true}
}, {versionKey: false});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;