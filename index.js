const stripJsonComments = require('strip-json-comments');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const utils = require('./utils');
const configJson = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
const config = JSON.parse(stripJsonComments(configJson));

const prcJson = fs.readFileSync(path.join(__dirname, 'process.json'), 'utf8');
const prcs = JSON.parse(stripJsonComments(prcJson));
const ffcLoc = config['ffc-location'];

function getValue(value) {
  const resp = {
    isCommand: false,
    value: '',
  };
  /*
  if -> it's not a custom string (doesnt start with #)
  else if  -> it's a command
  else -> it's a value in the config
  */
  if (!value.trim().startsWith('#')) {
    resp.value = value;
  } else if (value.trim().slice(1).split('&')[0] in execCommand) {
    resp.isCommand = true;
    resp.value = value.trim().slice(1);
  } else {
    resp.value = value.trim().slice(1).split('.')
    .reduce((prev, cur, index) => {
      if (index === 0) return prev;
      return prev[cur];
    }, config);
  }

  return resp;
}

const execCommand = {

  comment(input, match, regex) {
    if (match[0].trim().startsWith('#')) {
      utils.log1(`comment: Already Commented -> '${match[0]}'`);
      return input;
    }
    utils.log1(`comment: Commented ->  '${match[0]}'`);
    return input.replace(regex, `# ${match[0]}`);
  },

  uncomment(input, match, regex, key, value) {
    if (!match[0].trim().startsWith('#') && !value.includes('&')) {
      utils.log1(`uncomment: Already UnCommented -> '${match[0]}'`);
      return input;
    }

    if (value.includes('&')) {
      const val = getValue(value.split('&')[1]);
      utils.log1(`uncomment: UnCommented and Modified value for '${key}' -> '${key}${match[2]}= ${val.value}'`);
      return input.replace(match[0], `${key}${match[2]}=${val.value}`);
    }

    utils.log1(`uncomment: UnCommented ->  '${match[0]}'`);
    return input.replace(match[0], `${key}${match[2]}=${match[3]}`);
  },

  comment_all_lines(input) {
    if (input.match(/^# /gm).length === input.match(/^/gm).length) {
      utils.log1('comment_all_lines: All lines already Commented');
      return input;
    }
    utils.log1('comment_all_lines: Commented all lines');
    return input.replace(/^/gm, '# ');
  },
};

/*
key    -> Key contains name of a key in the property file
value  -> Could be a command or a path to a config in the config file
input  -> contents of the file as a string
*/
function modifier(key, value, input) {
  let output = input;
  const newValue = getValue(value);

  if (key === null) {
    return execCommand[newValue.value](input, value);
  }

  // finding key in the file string
  const regex = new RegExp(`([# ]*)${key}( *)=(.*)`);
  // ${match[1]}${key}${match[2]}= ${newValue.value}
  const match = regex.exec(input);
  // match[0] whole string
  // match[x] the x star

  if (match == null) return output;

  if (newValue.isCommand) {
    output = execCommand[newValue.value.split('&')[0]](input, match, regex, key, value);
  } else {
    utils.log1(`Modified value for '${key}' -> '${match[1]}${key}${match[2]}= ${newValue.value}'`);
    output = input.replace(regex, `${match[1]}${key}${match[2]}= ${newValue.value}`);
  }

  return output;
}

function configureFile(filename, modification) {
  const input = fs.readFileSync(path.join(ffcLoc, filename), 'utf8');
  let output = input;
  utils.log(`${filename}:`);
  if (typeof modification === 'string') {
    output = modifier(null, modification, output);
  } else {
    Object.keys(modification).forEach(key => {
      output = modifier(key, modification[key], output);
    });
  }
  fs.writeFileSync(path.join(ffcLoc, filename), output, 'utf8');
}


function configureFFC(prc) {
  Object.keys(prc).forEach(fileOrMode => {
    if (fileOrMode === 'all-files') {
      glob(path.join(ffcLoc, '/*.properties'), (er, filepath) => {
        const filename = filepath.map(filepaths => filepaths.replace(`${ffcLoc}/`, ''));
        filename.forEach((file) => {
          configureFile(file, prc[fileOrMode]);
        });
      });
    } else if (fileOrMode === 'env-specific') {
      Object.keys(prc[fileOrMode]).forEach(mode => {
        if (mode === config.env) {
          configureFFC(prc[fileOrMode][mode]);
        }
      });
    } else {
      configureFile(fileOrMode, prc[fileOrMode]);
    }
  });
}

configureFFC(prcs);
