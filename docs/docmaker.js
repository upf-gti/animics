// @jxarco

const KEY_WORDS = ['var', 'let', 'const', 'static', 'function', 'null', 'undefined', 'new', 'delete', 'true', 'false', 'NaN', 'this'];
const STATEMENT_WORDS = ['for', 'if', 'else', 'return', 'continue', 'break', 'case', 'switch', 'while', 'import', 'from'];
const HTML_ATTRIBUTES = ['html', 'charset', 'rel', 'src', 'href', 'crossorigin', 'type', 'lang'];
const HTML_TAGS = ['html', 'DOCTYPE', 'head', 'meta', 'title', 'link', 'script', 'body', 'style'];

let mainContainer = document.body;

function SET_DOM_TARGET( element )
{
    mainContainer = element;
}

function MAKE_LINE_BREAK()
{
    mainContainer.appendChild( document.createElement('br') );
}

function MAKE_HEADER( string, type, id )
{
    console.assert(string && type);
    let header = document.createElement(type);
    header.innerHTML = string;
    if(id) header.id = id;
    mainContainer.appendChild( header );
}

function MAKE_PARAGRAPH( string, sup )
{
    console.assert(string);
    let paragraph = document.createElement(sup ? 'sup' : 'p');
    paragraph.className = "leading-relaxed";
    paragraph.innerHTML = string;
    mainContainer.appendChild( paragraph );
}

function MAKE_NOTE( string, title = "Note")
{
    console.assert(string);

    let note = document.createElement('div');
    note.className = "note";

    let header = document.createElement('div');
    header.className = "note-header";
    header.appendChild(LX.makeIcon("NotepadText"));
    header.innerHTML += "<b>" + title + "</b>";

    let body = document.createElement('div');
    body.className = "note-body";
    body.innerHTML = string;

    note.appendChild(header);
    note.appendChild(body);
    mainContainer.appendChild(note);
}

function MAKE_CARDS(title, subtitle, cards) {
    console.assert(cards && cards.length > 0);

    const cardsContent = LX.makeContainer(["100%", "auto"], "flex flex-col gap-4 my-6 p-4", "", mainContainer);
    LX.makeContainer(["auto", "auto"], "text-xxl font-bold", title, cardsContent);
    if (subtitle) {
        LX.makeContainer(["auto", "auto"], "text-xl", subtitle, cardsContent);
    }

    const projectItems = LX.makeContainer(["100%", "auto"], "grid gap-2 p-1 overflow-y-auto overflow-x-hidden ", "", cardsContent);
    projectItems.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
    projectItems.id = "project-items-container";

    if (projectItems && projectItems.lastChild) {
        projectItems.lastChild.remove();
        if (refresh) {
            projectItems.innerHTML = "";
        }
    }
    for (const data of cards) {
        _makeProjectItem(data);
    }

}

function MAKE_CODE( text )
{
    console.assert(text);

    text.replaceAll('<', '&lt;');
    text.replaceAll('>', '&gt;');

    let highlight = "";
    let content = "";

    const getHTML = ( h, c ) => {
        return `<span class="${ h }">${ c }</span>`;
    };

    for( let i = 0; i < text.length; ++i )
    {
        const char = text[ i ];
        const string = text.substr( i );

        const endLineIdx = string.indexOf( '\n' );        
        const line = string.substring( 0, endLineIdx > -1 ? endLineIdx : undefined );
        
        if( char == '@' )
        {
            const str = line.substr( 1 );
            
            if ( !( str.indexOf( '@' ) > -1 ) && !( str.indexOf( '[' ) > -1 ) )
            {
                continue;
            }

            let html = null;

            const tagIndex = str.indexOf( '@' );
            const skipTag = ( str[ tagIndex - 1 ] == '|' );

            // Highlight is specified
            if( text[ i + 1 ] == '[' )
            {
                highlight = str.substr( 1, 3 );
                content = str.substring( 5, tagIndex );

                if( skipTag )
                {
                    const newString = str.substring( 6 + content.length );
                    const preContent = content;
                    const postContent = newString.substring( 0, newString.indexOf( '@' ) );
                    const finalContent = preContent.substring( 0, preContent.length - 1 ) + '@' + postContent;
                    html = getHTML( highlight, finalContent );

                    const ogContent = preContent + '@' + postContent;
                    text = text.replace( `@[${ highlight }]${ ogContent }@`, html );
                }
                else
                {
                    html = getHTML( highlight, content );
                    text = text.replace( `@[${ highlight }]${ content }@`, html );
                }
            }
            else
            {
                content = str.substring( 0, tagIndex );
                if( skipTag )
                {
                    const preContent = str.substring( 0, str.indexOf( '@' ) - 1 );
                    content = str.substring( preContent.length + 1 );
                    content = preContent + content.substring( 0, content.substring( 1 ).indexOf( '@' ) + 1 );
                    text = text.substr( 0, i ) + '@' + content + '@' + text.substr( i + content.length + 3 );
                }

                if( KEY_WORDS.includes( content ) )
                {
                    highlight = "kwd";    
                }
                else if( STATEMENT_WORDS.includes( content ) )
                {
                    highlight = "lit";    
                }
                else if( HTML_TAGS.includes( content ) )
                {
                    highlight = "tag";    
                }
                else if( HTML_ATTRIBUTES.includes( content ) )
                {
                    highlight = "atn";    
                }
                else if( ( content[ 0 ] == '"' && content[ content.length - 1 ] == '"' ) ||
                        ( content[ 0 ] == "'" && content[ content.length - 1 ] == "'" ) ||
                        ( content[ 0 ] == "`" && content[ content.length - 1 ] == "`" ) )
                {
                    highlight = "str";
                }
                else if( parseFloat( content ) != NaN )
                {
                    highlight = "dec";    
                }
                else
                {
                    console.error( "ERROR[Code Parsing]: Unknown highlight type: " + content );
                    return;
                }

                html = getHTML( highlight, content );
                text = text.replace( `@${ content }@`, html );
            }

            i += ( html.length - 1 );
        }
    }
    
    let container = document.createElement('div');
    container.className = "code-container";
    let pre = document.createElement('pre');
    let code = document.createElement('code');
    code.innerHTML = text;

    let button = document.createElement('button');
    button.title = "Copy code sample";
    button.appendChild(LX.makeIcon( "Copy" ));
    button.addEventListener('click', COPY_SNIPPET.bind(this, button));
    container.appendChild( button );

    pre.appendChild( code );
    container.appendChild( pre );
    mainContainer.appendChild( container );
}

function MAKE_BULLET_LIST( list )
{
    console.assert(list && list.length > 0);
    let ul = document.createElement('ul');
    for( var el of list ) {
        let li = document.createElement('li');
        li.innerHTML = el;
        ul.appendChild( li );
    }
    mainContainer.appendChild( ul );
}

function MAKE_NUMBER_LIST( list )
{
    console.assert(list && list.length > 0);
    let ol = document.createElement('ol');
    for( var el of list ) {
        let li = document.createElement('li');
        li.innerHTML = el;
        ol.appendChild( li );
    }
    mainContainer.appendChild( ol );
}

function ADD_CODE_LIST_ITEM( item, target )
{
    target = target ?? window.listQueued;
    let split = (item.constructor === Array);
    if( split && item[0].constructor === Array ) {
        MAKE_CODE_BULLET_LIST( item, target );
        return;
    }
    let li = document.createElement('li');
    li.innerHTML = split ? ( item.length == 2 ? INLINE_CODE( item[0] ) + ": " + item[1] : INLINE_CODE( item[0] + " <span class='desc'>(" + item[1] + ")</span>" ) + ": " + item[2] ) : INLINE_CODE( item );
    target.appendChild( li );
}

function MAKE_CLASS_METHOD( name, desc, params, ret )
{
    START_CODE_BULLET_LIST();
    let paramsHTML = "";    
    for( var p of params ) {
        const name = p[ 0 ];
        const type = p[ 1 ];
        paramsHTML += name + ": <span class='desc'>" + type + "</span>" + ( params.indexOf( p ) != (params.length - 1) ? ', ' : '' );
    }
    let li = document.createElement('li');
    li.innerHTML = INLINE_CODE( "<span class='method'>" + name + " (" + paramsHTML + ")" + ( ret ? (": " + ret) : "" ) + "</span>" );
    window.listQueued.appendChild( li );
    END_CODE_BULLET_LIST();
    MAKE_PARAGRAPH( desc );
}

function MAKE_CLASS_CONSTRUCTOR( name, params )
{
    let paramsHTML = "";    
    for( var p of params ) {
        const name = p[ 0 ];
        const type = p[ 1 ];
        paramsHTML += name + ": <span class='desc'>" + type + "</span>" + ( params.indexOf( p ) != (params.length - 1) ? ', ' : '' );
    }
    let pr = document.createElement('p');
    pr.innerHTML = INLINE_CODE( "<span class='constructor'>" + name + "(" + paramsHTML + ")" + "</span>" );
    mainContainer.appendChild( pr );
}

function MAKE_CODE_BULLET_LIST( list, target )
{
    console.assert(list && list.length > 0);
    let ul = document.createElement('ul');
    for( var el of list ) {
        ADD_CODE_LIST_ITEM( el, ul );
    }
    if( target ) {
        target.appendChild( ul );
    } else {
        mainContainer.appendChild( ul );
    }
}

function START_CODE_BULLET_LIST()
{
    let ul = document.createElement('ul');
    window.listQueued = ul;
}

function END_CODE_BULLET_LIST()
{
    console.assert( window.listQueued );
    mainContainer.appendChild( window.listQueued );
    window.listQueued = undefined;
}

function INLINE_LINK( string, href )
{
    console.assert(string && href);
    return `<a href="` + href + `">` + string + `</a>`;
}

function INLINE_PAGE( string, page )
{
    console.assert(string && page);
    return `<a onclick="loadPage('` + page + `')">` + string + `</a>`;
}

function INLINE_CODE( string, codeClass )
{
    console.assert(string);
    return `<code class="inline ${ codeClass ?? "" }">` + string + `</code>`;
}

function COPY_SNIPPET( b )
{
    b.innerHTML = "";
    b.appendChild(LX.makeIcon( "Check" ));
    b.classList.add('copied');

    setTimeout( () => {
        b.innerHTML = "";
        b.appendChild(LX.makeIcon( "Copy" ));
        b.classList.remove('copied');
    }, 2000 );

    navigator.clipboard.writeText( b.dataset['snippet'] ?? b.parentElement.innerText );
    console.log("Copied!");
}

function INSERT_IMAGE( src, caption = "" )
{
    let img = document.createElement('img');
    img.src = src;
    img.alt = caption;
    mainContainer.appendChild( img );
}

function INSERT_VIDEO( src, caption = "", controls = true, autoplay = false )
{
    let video = document.createElement('video');
    video.src = src;
    video.controls = controls;
    video.autoplay = autoplay;
    if (autoplay) video.muted = true;
    video.loop = true;
    video.alt = caption;
    mainContainer.appendChild(video);
}


function _makeProjectItem(item) {
    const projectItems = document.getElementById("project-items-container");

    let color = "--global-color-accent";

    let imageContainer = `<div class="rounded-xl w-full bg-blur flex justify-center items-center overflow-hidden justify-center hover:scale" style="min-height: 130px;">
            <p class="text-xl font-extrabold fg-secondary" style="text-shadow: 1px 1px 0px var(${color});">${item.title}</p>
        </div>`
    if (item.img) {
        imageContainer = `<img class="w-full hover:scale" style="object-fit:cover" src="${item.img || "./docs/imgs/editStation.png"} ">`
    }

    const itemContainer = LX.makeContainer(["auto", "auto"], "flex flex-col gap-4 p-4 text-md rounded-xl hover:bg-tertiary hover:scale cursor-pointer", `
        <div class="rounded-xl w-full overflow-hidden justify-center" style="height:130px;">
            ${imageContainer}
        </div>
        <div class="flex flex-row justify-between px-1" style="align-items: center;">
            <div class="flex flex-col gap-0.5">
                <p class="text-xl font-bold fg-secondary">${item.title}</p>
                <p>${item.description ? item.description : ""}</p>
            </div>
            ` + LX.makeIcon("ArrowRight").innerHTML +
        `</div>
    `, projectItems);

    itemContainer.addEventListener("click", () => {
        loadPage(item.link);
    });


}