## Modules:
- A Node Module is Simply a JS File. It's a way to separate concerns throughout
our application instead of having it all inside one file. 
- For example, imagine in some `Module1.js` file we have a bunch of Math Functions, API Requests, and Database Calls. 
- Instead of putting them all in one file, we could separate each of these concerns into their own file: One for Math Functions, One for API Requests, and one for Database Calls. That makes the code more tidy and manageable. 

### Explained Example:
- We have this `sum` function in `Module2.js`. Now, let's say that we want to exxpose it to the world so that any module that wants to use it, such as `Module1.js`, may simply Import it and use it right away instead of having to implement it from scratch. How do we do this?

#### Method 1:
- What we can do is go to `Module2.js` and write `module.exports = sum;`
- This makes the `sum` function available as one of the exports of `Module2.js`.
- Now, we need to tell `Module1.js` where this `sum` function is located. 
- To do this, we must declare a variable (`Module2Tools`) that points to `Module1.js` and through this `Module2Tools` variable, we may access everything that `Module2.js` makes available through its declared exports.
- We define this variable through `const Module2Tools = require('./Module2.js')`
- FYI: By Printing out the contents of the required variable, we can actually see everything that its module exports and makes available to us:
![alt text](../999_Images_Folder/ImportExport.png)
