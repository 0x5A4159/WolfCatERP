const form = document.querySelector('form');

form.addEventListener('submit', processSubmit);

function processSubmit(event) {
    console.log(event);
}