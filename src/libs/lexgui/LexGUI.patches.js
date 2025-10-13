// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';

// FIX 1

/**
 * @method getSubitems
 * @param {Object} item: parent item
 * @param {Array} tokens: split path strings
*/
LX.Menubar.prototype.getSubitem = function( item, tokens ) {

    let subitem = null;
    let path = tokens[ 0 ];

    for( let i = 0; i < item.length; i++ )
    {
        if ( !item[ i ] )
        {
            continue;
        }

        if( item[ i ].name == path )
        {
            if( tokens.length == 1 )
            {
                subitem = item[ i ];
                return subitem;
            }
            else if ( item[ i ].submenu )
            {
                tokens.splice( 0, 1 );
                return this.getSubitem( item[ i ].submenu, tokens );
            }

        }
    }

    return null;
}

// END OF FIX 1


export{};