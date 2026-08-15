const sum = (num1, num2) => num1 + num2;
//module.exports = sum;

const PI =  3.14159
class Person {
    constructor(name, age){
        this._name = name;
        this._age = age;
    }

    displayInfo(){
        return `Hello! I am ${this._name}, and I am ${this._age} years old!`
    }
    getName(){
        return this._name;
    }
    getAge(){
        return this._age;
    }
    setName(newName){
        this._name = newName;
    }
    setAge(newAge){
        this._age = newAge;
    }
}

/*
module.exports.sum = sum;
module.exports.Person = Person;
module.exports.PI = PI;
*/

module.exports = {
    sum : sum,
    Person : Person,
    PI : PI
};


