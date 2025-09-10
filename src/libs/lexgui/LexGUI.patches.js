// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';

// if a submenu was pos.y > window.innerHeight, the clamped pos.y was not computed right.
LX.ContextMenu.prototype._adjustPosition = function( div, margin, useAbsolute = false ) {

    let rect = div.getBoundingClientRect();
    let left = parseInt( div.style.left );
    let top = parseInt( div.style.top );

    if( !useAbsolute )
    {
        let width = rect.width;
        if( rect.left < 0 )
        {
            left = margin;
        }
        else if( window.innerWidth - rect.right < 0 )
        {
            left = (window.innerWidth - width - margin);
        }

        if( rect.top < 0 )
        {
            top = margin;
        }
        else if( (rect.top + rect.height) > window.innerHeight )
        {
            div.style.marginTop = "";                               // <------------- Added this
            top = (window.innerHeight - rect.height - margin);
        }
    }
    else
    {
        let dt = window.innerWidth - rect.right;
        if( dt < 0 )
        {
            left = div.offsetLeft + (dt - margin);
        }

        dt = window.innerHeight - (rect.top + rect.height);
        if( dt < 0 )
        {
            top = div.offsetTop + (dt - margin + 20 );
        }
    }

    div.style.left = `${ left }px`;
    div.style.top = `${ top }px`;
}

export{};