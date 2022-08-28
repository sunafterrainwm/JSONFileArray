/* eslint-disable es-x/no-class-fields */
import fs = require( 'fs' );
import path = require( 'path' );
import util = require( 'util' );

export type ValidateFunction<T> = ( value: T ) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IFunction = ( ...args: any[] ) => any;

type ArrayMethodsKeys = {
	[ key in keyof typeof Array.prototype ]: null[][ key ] extends IFunction ?
		key :
		never;
}[ keyof typeof Array.prototype ];
type ArrayMethods = {
	[ key in ArrayMethodsKeys ]: unknown[][ key ]
};

function defaultValidFunction() {
	return true;
}

export type ErrorCallback = ( error: JSONFileArrayError | NodeJS.ErrnoException ) => void;

function defaultErrorCallback( error: JSONFileArrayError | NodeJS.ErrnoException ) {
	process.nextTick( function () {
		throw error;
	} );
}

export class JSONFileArrayError extends Error {
	override name = 'JSONFileArrayError';

	static fromError( error: unknown, message?: string ) {
		if ( error instanceof Error ) {
			const nError = new this( ( message ? message + ': ' : '' ) + error.message );
			if ( error.stack ) {
				if ( error instanceof this ) {
					nError.stack = error.stack;
				} else {
					nError.stack += '\nFrom previous error: \n' + error.stack;
				}
			}
			return nError;
		} else {
			return new this(
				( message ? message + ': ' : '' ) +
				( error && typeof error === 'object' ? util.inspect( error ) : String( error ) )
			);
		}
	}
}

export class JSONFileArray<T> extends Array<T> {
	protected isInitial = false;

	constructor(
		protected fileName: string,
		protected validateFunction: ValidateFunction<T> = defaultValidFunction,
		protected errorCallback: ErrorCallback = defaultErrorCallback
	) {
		super();
		if ( !path.isAbsolute( fileName ) ) {
			this.fileName = fileName = path.resolve( process.cwd(), fileName );
		}
		try {
			if ( !fs.existsSync( fileName ) ) {
				fs.writeFileSync( fileName, '[]', {
					encoding: 'utf-8'
				} );
			} else {
				const content = fs.readFileSync( fileName, {
					encoding: 'utf-8'
				} );

				const json: T[] = JSON.parse( content ) as T[];

				if ( !Array.isArray( json ) ) {
					throw new JSONFileArrayError( 'JSON isn\'t a Array.' );
				}

				this.push(
					...json.filter( function ( item ) {
						if ( !validateFunction( item ) ) {
							errorCallback( new JSONFileArrayError( util.format( 'Fail to valid item %s.', util.inspect( item ) ) ) );
							return false;
						}

						return true;
					} )
				);
			}

			this.isInitial = true;
		} catch ( error ) {
			throw JSONFileArrayError.fromError( error, util.format( 'Can\'t parse file \'%s\'', fileName ) );
		}
	}

	protected saveToFile() {
		if ( !this.isInitial ) {
			return;
		}
		const errorCallback = this.errorCallback;
		fs.writeFile( this.fileName, JSON.stringify( this ), {
			encoding: 'utf8'
		}, function ( error ) {
			if ( error ) {
				errorCallback( error );
			}
		} );
	}

	static JSONFileArray = JSONFileArray;
	static Error = JSONFileArrayError;
	static JSONFileArrayError = JSONFileArrayError;
}

function wrapFunction<N extends keyof ArrayMethods>( name: N ): ArrayMethods[ N ] {
	// eslint-disable-next-line max-len
	return function ( this: JSONFileArray<unknown>, ...args: Parameters<ArrayMethods[ N ]> ): ReturnType<ArrayMethods[ N ]> {
		// @ts-expect-error TS2684
		// eslint-disable-next-line max-len
		const returnValue = Array.prototype[ name ].apply( this, args ) as ReturnType<ArrayMethods[ N ]>;
		this.saveToFile();
		return returnValue;
	} as ArrayMethods[ N ];
}

JSONFileArray.prototype.shift = wrapFunction( 'shift' );
JSONFileArray.prototype.pop = wrapFunction( 'pop' );

JSONFileArray.prototype.unshift = wrapFunction( 'unshift' );
JSONFileArray.prototype.push = wrapFunction( 'push' );

JSONFileArray.prototype.reverse = wrapFunction( 'reverse' );
JSONFileArray.prototype.splice = wrapFunction( 'splice' );
JSONFileArray.prototype.fill = wrapFunction( 'fill' ) as ( ...args: Parameters<unknown[][ 'fill' ]> ) => JSONFileArray<unknown>;

export {
	JSONFileArray as default
};
