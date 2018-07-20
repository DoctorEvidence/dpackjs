const Transform = require('stream').Transform
const createParser = require('./parse').createParser
const DEFAULT_OPTIONS = {objectMode: true}

class DPackParseStream extends Transform {
  constructor(options) {
    if (options) {
      options.objectMode = true
    } else {
      options = DEFAULT_OPTIONS
    }
    super(options)
    this.parser = createParser()
  }
  _transform(chunk, encoding, callback) {
    let value
    let sourceString = chunk.toString()
    this.parser.setSource(sourceString)
    try {
      do {
        value = this.parser.readOpen()
        if (value !== undefined)
          this.push(value)
      } while(this.parser.hasMoreData)
    } catch(error) {
      console.error(error)
      value = error
    }
    if (callback) callback()
  }
}

exports.createParseStream = () => new DPackParseStream()
