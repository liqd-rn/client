//https://medium.com/geekculture/canceling-fetch-requests-in-javascript-a-step-by-step-guide-54e143b0e2e4

import Querystring, { ClientQuery } from './querystring';

type Headers = Record<string, string>;
type Authorization = { headers?: Headers, query?: ClientQuery };
type ClientResponse<T> = { ok: boolean, status: number, statusText: string, headers: Headers, data?: T };

export type ClientRequestOptions =
{
    method      : 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    webroot?    : string,
    headers?    : Headers,
    query?      : ClientQuery,
    body?       : string | object,
    expires?    : Date | number,
    retries?    : number,
    authorizer? : ( req: { url: string, headers: Headers, body?: string, unauthorized?: { status: number, statusText: string, at: Date }}) => Promise<Authorization | number | undefined> | Authorization | number | undefined
}

const UNAUTHORIZED = 401;
//const FORBIDDEN = 403;
//const NOT_FOUND = 404;
//const TIMEOUT = 408;
//const INTERNAL_SERVER_ERROR = 500;

const lowercaseHeaders = ( headers: Headers = {}) => Object.entries( headers ).reduce(( lowercase, [ key, value ]) => (( lowercase[key.toLowerCase()] = value ), lowercase ), {} as Headers );

class ClientRequest<T>
{
    private controller?     : AbortController;
    private method          : ClientRequestOptions['method'];
    private headers         : Headers;
    private query?          : ClientQuery;
    private body?           : string;
    private expires?        : Date;
    private retries         : number = 0;
    private unauthorized?   : { status: number, statusText: string, at: Date };
    private authorizer?     : ClientRequestOptions['authorizer'];

    public response        : Promise<ClientResponse<T>>

    constructor( private url: string, options: ClientRequestOptions )
    {
        this.method     = options.method;
        this.headers    = lowercaseHeaders( options.headers );
        this.query      = options.query;
        this.expires    = typeof options.expires === 'number' ? new Date( Date.now() + options.expires ) : options.expires;
        this.retries    = options.retries || 0;
        this.authorizer = options.authorizer;

        options.webroot && ( this.url = new URL( this.url, options.webroot ).toString());

        if( typeof options.body === 'object' )
        {   
            if( this.headers['content-type'].startsWith('application/x-www-form-urlencoded') )
            {
                this.body = Querystring.stringify( options.body as ClientQuery );
            }
            else
            {
                !this.headers['content-type'] && ( this.headers['content-type'] = 'application/json' );
                this.body = JSON.stringify( options.body );
            }
        }

        this.response = this.send();
    }

    public async send(): Promise<ClientResponse<T>>
    {
        if( this.expires && this.expires < new Date() ){ throw new Error( 'Request expired' )}

        let url = Querystring.append( this.url, this.query ), headers = Object.assign({}, this.headers );

        const auth = await this.authorizer?.({ url, headers, body: this.body, unauthorized: this.unauthorized });

        if( typeof auth === 'number' )
        {
            return { ok: false, status: auth, statusText: 'Unauthorized', headers: {}, data: undefined };
        }

        auth?.headers && Object.assign( headers, lowercaseHeaders( auth.headers ));
        auth?.query && ( url = Querystring.append( url, auth.query ));

        this.controller = new AbortController();

        try
        {
            const response = await fetch( url,
            {
                method: this.method,
                signal: this.controller.signal,
            });

            //if( !this.unauthorized && ( response.status === UNAUTHORIZED || response.status === FORBIDDEN ))
            if( !this.unauthorized && response.status === UNAUTHORIZED )
            {
                this.unauthorized = { status: response.status, statusText: response.statusText, at: new Date() };

                return this.send();
            }
            else if( response.ok || this.retries <= 0 )
            {
                const headers = lowercaseHeaders( Object.fromEntries( response.headers.entries()));

                let data: any = await response.text();

                headers['content-type'].startsWith('application/json') && ( data = JSON.parse( data )); // TODO resolver

                return (
                {
                    ok          : response.ok,
                    status      : response.status,
                    statusText  : response.statusText,
                    headers,
                    data
                });
            }
        }
        catch( e: any )
        {
            // TODO if aborted
        }

        if( this.retries > 0 )
        {
            this.retries--;

            // TODO setTimeout

            return this.send();
        }

        throw new Error( 'error' );
    }

    public async cancel()
    {
        this.controller?.abort();
    }
}

export default class Client
{
    public static async request<T>( url: string, options: ClientRequestOptions )
    {
        return new ClientRequest<T>( url, options ).response;
    }

    public static async get<T>( url: string, options: Omit<ClientRequestOptions, 'method' | 'body'> = {} )
    {
        return await Client.request<T>( url, { ...options, method: 'GET' });
    }

    public static async post<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await Client.request<T>( url, { ...options, method: 'POST' });
    }

    public static async put<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await Client.request<T>( url, { ...options, method: 'PUT' });
    }

    public static async patch<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await Client.request<T>( url, { ...options, method: 'PATCH' });
    }

    public static async delete<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await Client.request<T>( url, { ...options, method: 'DELETE' });
    }
    
    public constructor( private options: Pick<ClientRequestOptions, 'webroot' | 'headers' | 'query' | 'authorizer'>)
    {
        this.options.headers && ( this.options.headers = lowercaseHeaders( this.options.headers ));
    }

    public async request<T>( url: string, options: ClientRequestOptions )
    {
        let { method, body, headers, query, expires, retries, authorizer } = options;

        let webroot = options.hasOwnProperty( 'webroot' ) ? options.webroot : this.options.webroot;

        return Client.request<T>( url, 
        {
            method, webroot, body, expires, retries,
            headers     : { ...this.options.headers, ...lowercaseHeaders( headers )}, 
            query       : { ...this.options.query, ...query },
            authorizer  : authorizer ?? this.options.authorizer
        });
    }

    public async get<T>( url: string, options: Omit<ClientRequestOptions, 'method' | 'body'> = {} )
    {
        return await this.request<T>( url, { ...options, method: 'GET' });
    }

    public async post<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await this.request<T>( url, { ...options, method: 'POST' });
    }

    public async put<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await this.request<T>( url, { ...options, method: 'PUT' });
    }

    public async patch<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await this.request<T>( url, { ...options, method: 'PATCH' });
    }

    public async delete<T>( url: string, options: Omit<ClientRequestOptions, 'method'> = {} )
    {
        return await this.request<T>( url, { ...options, method: 'DELETE' });
    }
}