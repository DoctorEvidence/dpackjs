const Transform = require('stream').Transform
const createDecoder = require('./decode').createDecoder
const DEFAULT_OPTIONS = {objectMode: true}

class DPackDecodeStream extends Transform {
  constructor(options) {
    if (options) {
      options.objectMode = true
    } else {
      options = DEFAULT_OPTIONS
    }
    super(options)
    this.decoder = createDecoder()
  }
  _transform(chunk, encoding, callback) {
    let value
    try {
      value = this.decoder.decode(chunk)
    } catch(error) {
      console.error(error)
      value = error
    }
    this.push(value)
    if (callback) callback()
  }
}

exports.createDecodeStream = () => new DPackDecodeStream()
