const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
const task = require('./models/tasks');
const bodyparser = require('body-parser');

const app = express();

app.set('view engine', 'ejs');

mongoose.connect('mongodb://127.0.0.1:27017/appdb')
    .then((result) => { console.log("DB connect on localhost:27017"); app.listen(8080); })
    .catch((err) => console.log("Failed connect"));

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

app.use(express.static('static'));

app.use((req, _, next) => {
    console.log(req.protocol + '://' + req.get('host') + req.originalUrl); // fully qualified url
    next();
})

app.get("/", (req, res) => {
    res.render('index'); // simulating no user sign-in
});

app.get("/home", (_, res) => {
    res.redirect("/");
});

app.get("/index", (_, res) => {
    res.redirect("/");
});

app.get("/tasks", (req, res) => {
    task.find()
        .then((result) => {
            res.render('tasks', {tasks: result});
        })
        .catch((error) => {
            console.log('Failed load tasks to /tasks/', error);
        });
})

app.get("/signin", (req, res) => {
    res.render('signin');
});

app.get("/signup", (req, res) => {
    res.render('signup');
});

app.post("/signin", async (req, res) => {
    let signinuser = await searchFind(req.body.uname);

    console.log('signinuser = ', signinuser);

    res.redirect('/'); // on complete sign in push to index
})

app.use((req, res) => {
    res.status(404).render('404');
});

const searchFind = async (objFind) => {
    return await user.findOne({ userName: objFind });
};