const EventEmitter = require("events");
const eventEmitter = new EventEmitter();

eventEmitter.on("tutorial", (num1, num2) => {
    console.log(`The Sum is: ${num1 + num2}`);
});

eventEmitter.emit("tutorial", 4, 2);


class Person extends EventEmitter{
    constructor(name){
        super();
        this._name = name;
    }
    getName(){
        return this._name;
    }
    setName(name){
        this._name = name;
    }
}

const Awab = new Person("Awab");
Awab.on("name", () => {
    console.log(`My name is ${Awab.getName()}`);
});

Awab.emit("name");


const Ali = new Person("Ali");
Ali.on("name", ()=> {
    console.log(`My name is ${Ali.getName()}`);
});

Ali.emit("name");
