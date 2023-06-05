const express = require('express');
const mongoose = require('mongoose');
const user = require('./models/userinfo');
const task = require('./models/tasks');
const bodyparser = require('body-parser');

const app = express();

app.set('view engine', 'ejs');

mongoose.connect('mongodb://127.0.0.1:27017/appdb')
    .then((result) => { console.log("DB connect on localhost:27017"); app.listen(8080,'192.168.1.69'); })
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

app.post("/tasks", async (req, res) => {
    const userPost = req.body.completereq;
    const userTask = req.body.taskAdd;

    if (userPost !== undefined) { // if they press done, userPost will have the id of the task as a value
        const document = await task.findById(userPost);
        document.complete = true;
        await document.save();

        res.redirect('/tasks');
    }
    else {
        const userDesc = (req.body.taskAddDesc.length > 0) ? req.body.taskAddDesc : "No Description"; // ternary default empty string to 'no description'
        // for SOME REASON, typeof wont work because blank results instantiate as strings. Is this a JavaScript problem or a me problem?

        task.create({ title: userTask, description: userDesc, complete: false });

        res.redirect('/tasks');
    };
});

app.get("/tasks", (req, res) => {
    task.find({ complete: false })
        .then((result) => {
            res.render('tasks', { tasks: result });
        })
        .catch((error) => {
            console.log('Failed load tasks to /tasks/', error);
        });
});

app.get("/tasks/id/:urlid", (req, res) => { // now supporst ability to view tasks (Yay!)
    const id_to_find = req.params.urlid;
    task.findById(id_to_find).then((result) => {
        res.render('individual_task', { task: result });
    })
    .catch((error) => {
        console.log(error);
        res.redirect('404');
    });
});

app.get("/tasks/history", (req, res) => {
    task.find({ complete: true }).then((result) => {
        console.log(result);
        res.render('task_history', { tasks: result });
    })
        .catch((error) => {
            console.log(error);
            res.redirect('404')
        })
});

app.get("/signin", (req, res) => {
    res.render('signin');
});

app.get("/signup", (req, res) => {
    res.render('signup');
});

app.get("/tasks/api/fetchAll", (req, res) => {
    task.find({ complete: false })
        .then((result) => {
            const resfilter = result.map(val => val._id.toString());
            res.send({ taskupdate: resfilter });
        })
        .catch((error) => {
            console.log('Failed understand fetchAll request', error);
        });
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