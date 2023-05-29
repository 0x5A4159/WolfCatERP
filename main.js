const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
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
    //const _ = user.findById('647382229f699428ff7dfc84')     // lazily getting value for testing
    //    .then((result) => { res.render('index', { user: result }); })
    //    .catch((err) => { console.log(err); });

    res.render('index'); // simulating no user sign-in
});

app.get("/home", (_, res) => {
    res.redirect("/");
});

app.get("/index", (_, res) => {
    res.redirect("/");
});

app.get("/signin", (req, res) => {
    res.render('signin');
});

app.get("/signup", (req, res) => {
    res.render('signup');
});

app.post("/signin", (req, res) => {
    user.findOne({ userName: req.body.uname }).then((result) => {
        if (result) {   // finding a good result
            console.log('found a good result');
        }
        else {  // no result, send a default
            console.log('found no result');
        }
    }).catch((err) => { console.log('error') }); // catch all error handling?

    res.redirect('/'); // on complete sign in push to index
})

app.use((req, res) => {
    res.status(404).render('404');
});

