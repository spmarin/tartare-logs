/*

 Copyright 2015 Telefonica Investigación y Desarrollo, S.A.U

 This file is part of Tartare.

 Tartare is free software: you can redistribute it and/or modify it under the
 terms of the Apache License as published by the Apache Software Foundation,
 either version 2.0 of the License, or (at your option) any later version.
 Tartare is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the Apache License for more details.

 You should have received a copy of the Apache License along with Tartare.
 If not, see http://www.apache.org/licenses/LICENSE-2.0

 For those usages not covered by the Apache License please contact with:
 joseantonio.rodriguezfernandez@telefonica.com

 */

'use strict';

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    os = require('os');

/**
 * This class is a log stream watcher, that is, an object that is watching a stream, waiting for changes on it.
 * It is an event emitter, that emit 'log' events when new log entries are written to the file.
 * Log entries are matched against the provided pattern so the 'log' event will have an object
 * It also emit 'error' events when some error happen.
 *
 * @param stream
 * @param pattern RegExp against which each new log entry will be matched to extract the log fields
 * @param fieldNames Array of field names used to build the object emitted by the 'log' event,
 *               using the values gathered from matching the pattern against a log entry
 * @param opts Supported values:
 *               - autoStart: If true, the log watcher start watching the log file immediately
 *               - allowPatternViolations (defaults to false): If true, log entries not matching the pattern will not
 *                   emit an error, but will be added to the previous log entry. Useful to support logs
 *                   with stacktraces, and any other kink of dump.
 *               - retainedLogTimeout: Timeout no emit a log that has been retained just in case it were not a
 *                   complete log (because the last change in the log file could be part of this log)
 * @constructor
 */
var LogStreamWatcher = function LogStreamWatcher(stream, pattern, fieldNames, opts) {
  EventEmitter.call(this);

  this.logStream = stream;
  this.pattern = pattern;
  this.fieldNames = fieldNames;
  this.opts = opts || {};
  this.allowPatternViolations = opts.allowPatternViolations || false;
  this.retainedLogTimeout = opts.retainedLogTimeout || 300;
  this.watcher = null;

  var autoStart = this.opts.autoStart || false;
  if (autoStart) {
    this.start();
  }
};
util.inherits(LogStreamWatcher, EventEmitter);

/**
 * Start watching the Stream. If the log file is already been watching, it does nothing.
 */
LogStreamWatcher.prototype.start = function start() {
  var self = this;

  var line = null;
  var currentLog = null;
  var retainedLogTimeoutId;

  function processLine() {

    if (line.trim() === '') {
      return;
    }
    var fieldsValues = line.trim().match(self.pattern);
    if (fieldsValues === null) {
      // In case the log entry does not match the pattern
      if (self.allowPatternViolations && currentLog) {
        // If the previous line is a valid log and pattern violations are allowed,
        // add the current line to the last field of the last log that matched the pattern
        currentLog[self.fieldNames[self.fieldNames.length - 1]] += os.EOL + line;
        return;
      } else {
        // If pattern violations are not allowed or there are not any log matching the pattern yet, emit an error
        self.emit('error', new Error('LogStreamWatcher: log line does not follow the given pattern: ' + line));
        return;
      }
    }
    //Emit previous log
    if (currentLog) {
      self.emit('log', currentLog);
    }
    // This is a log entry matching the pattern, build the log object
    var currentLog = {};
    for (var i = 1; i < fieldsValues.length; i++) {
      currentLog[self.fieldNames[i - 1]] = fieldsValues[i];
    }
    // This log will be retained.
    // Set a timeout in order to emit the retained log after some time, to avoid infinitely retain a log
    // because it could be the last log.
    retainedLogTimeoutId = setTimeout(function(retainedLog) {
      if (currentLog === retainedLog) {
        self.emit('log', retainedLog);
        currentLog = null;
      } else {
      }
    }, self.retainedLogTimeout, currentLog);

  }

  // Start watching the stream
  self.logStream.on('data', function (chunk) {
    line = chunk.toString();
    processLine();
  });
};

/**
 * Stop watching the log file
 */
LogStreamWatcher.prototype.stop = function stop() {
  var self = this;
  this.removeAllListeners();
  if (self.logStream) {
    self.logStream.removeAllListeners('data');
  }
};

module.exports = LogStreamWatcher;
