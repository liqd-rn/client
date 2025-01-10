type ClientQueryAtomicValue = string | number | undefined | object
type ClientQueryValue = ClientQueryAtomicValue | ClientQueryAtomicValue[] | Record<string, ClientQueryAtomicValue | object> // TODO recursive

export type ClientQuery = Record<string, ClientQueryValue>

function stringify( data: ClientQuery | ClientQueryAtomicValue, querystring: string[] = [], prefix: string = '' )
{
    if( data === null )
    {
        querystring.push( prefix );
    }
    else if( typeof data === 'boolean' )
    {
        querystring.push( prefix + '=' + ( data ? '1' : '0' ));
    }
    else if( typeof data === 'number' || typeof data === 'string' )
    {
        querystring.push( prefix + '=' + encodeURIComponent( data.toString() ));
    }
    else if( Array.isArray( data ))
    {
        for( let i = 0; i < data.length; ++i )
        {
            stringify( data[i], querystring, prefix + '[' + i + ']' );
        }
    }
    else if( typeof data === 'object' )
    {
        for( let [ key, value ] of Object.entries( data ))
        {
            stringify( value, querystring, prefix ? prefix + '[' + key + ']' : key );
        }
    }

    return querystring;
}

export default class Querystring
{
    static stringify( data: ClientQuery ): string
    {
        return stringify( data ).join('&');
    }

    static append( url: string, data?: ClientQuery ): string
    {
        return url + ( data && Object.keys( data ).length ? ( url.includes('?') ? '&' : '?' ) + Querystring.stringify( data ) : '' );
    }
}
