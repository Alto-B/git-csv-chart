var exec = require("child_process").exec;

const result = (command, cb) => {
  return new Promise((resolve, reject) => {
    var child = exec(command, function (err, stdout, stderr) {
      if (typeof cb === "function") {
        if (err != null) {
          return cb(new Error(err), null);
        } else if (typeof stderr != "string") {
          return cb(new Error(stderr), null);
        } else {
          return cb(null, stdout);
        }
      } else {
        if (err != null) {
          resolve(new Error(err));
        } else if (typeof stderr != "string") {
          resolve(new Error(stderr));
        } else {
          resolve(stdout);
        }
      }
    });
  });
};

exports.result = result;
