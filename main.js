const express = require('express');
const mongoose = require('mongoose');

const app = express();

app.set('view engine', 'ejs');

//mongoose.connect('mongodb://127.0.0.1:27017/appdb')
//    .then((result) => { console.log("DB connect on localhost:27017"); app.listen(8080); })
//    .catch((err) => console.log("Failed connect"));

const tempuser = { name: "" };

app.listen(8080,'192.168.1.69');

app.use(express.static('static'));

app.get("/", (req, res) => {
    res.render('index', {userName: tempuser});
});

app.use((req, res) => {
    res.status(404).render('404');
});
