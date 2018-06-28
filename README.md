<a href="https://dev.doctorevidence.com/"><img src="./assets/powers-dre.png" width="203" /></a>

MessagePack codec/extension for documents, an object or array that contains reusable structures/templates for more efficient, compact, faster encodings, and for lazy parsing.


Specification:

0x00 is always null
there are encoding types and data types:
1st bit indicates if it one or multiple byte definitoin
next 3bits encoding types form the four bits of every value:

data types:
object type: encoding types:
0 - object with structure reference
1 - object with inline structure - value is structure length
2 - object special - quick reference < 16 - >= 16 -
	17 - object with binary key positions
	100 > object reference?
3 - array


string type: encoding types:
0: string back reference
1: inline string
2: reserved - hashed string reference?
3: array
string length = num

open type:
0: special -
	constants:
	0 - null
	1 - false
	2 - true
	3 - undefined
	4 - NaN
	5 - Infinity
	6 - -Infinity
	8 - object (next block)
	9 - string (next block)
	10 - isolated structure/property/value tables - next value is object
	11 - binary (base 64) (next block is string decoded as base 64)
	12 - ext
	13 - date - next block is number as date in epoch milliseconds
1: unsigned integer (number is integer)
2: number as string
3: array


property type:
0: property reference
1: object type with string key (value defines string length)
2: string type...
3: open type...
extended unicode - for metadata


4: open type...
5: property reference
6: property with metadata - first block defines type/key, next defines metadata evaluated as
7: fixed value (value is next block read as open type)

buffers?
documents (lazy evaluation)?
property metadata
extensions
dates

object with binary key positions (from here):
# keys | key position as defined above | rest of object


properties:
independent object serializations can be context-free and safely inserted
can be lazily evaluated (at binary level)
is valid utf-8 (can be evaluated as utf-8 as the first step, and should be unless lazy evaluation is necessary)
supports property metadata and types including boolean, string, number, decimal, object, arrays, dates, binary.
compact, fast
can be progressively evaluated



utf-8 encoding vs ascii-only encoding
utf-8 encoding
faster large number reading
more bits for single byte encoding
7, 11, 16, 21

ascii-only
better huffman encoding
allow for alternate character encodings
more bits for multi-byte encoding
could use utf-8 as an escape
simpler binary level specification
6, 12, 18, 24

utf-8 with 2 byte cutoff
double byte less bits, but quadruple bits
7, 10, 16, 22
