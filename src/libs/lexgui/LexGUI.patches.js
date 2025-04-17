// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';


// ----- VISUAL BUG: FIX AREA RESIZE THROUGH SPLIT BAR ----- 
// When several resizeable areas are nested, inner areas resized through split bar might not resize properly when an upper area resizes
// fix: area resize through split bar now computes percentages instead of hardcoding pixels
LX.Area.prototype._moveSplit = function ( dt, forceAnimation = false, forceWidth = 0 ) {

    if( !this.type )
    {
        throw( "No split area" );
    }

    if( dt === undefined ) // Splitbar didn't move!
    {
        return;
    }

    const a1 = this.sections[ 0 ];
    var a1Root = a1.root;

    if( !a1Root.classList.contains( "origin" ) )
    {
        a1Root = a1Root.parentElement;
    }

    const a2 = this.sections[ 1 ];
    const a2Root = a2.root;
    const splitData = " - "+ LX.DEFAULT_SPLITBAR_SIZE + "px";

    let transition = null;
    if( !forceAnimation )
    {
        // Remove transitions for this change..
        transition = a1Root.style.transition;
        a1Root.style.transition = a2Root.style.transition = "none";
        flushCss( a1Root );
        flushCss( a2Root );
    }

    if( this.type == "horizontal" )
    {
        var size = Math.max( a2Root.offsetWidth + dt, parseInt( a2.minWidth ) );
        if( forceWidth ) size = forceWidth;

        const a2per = Math.max(0, size / this.root.offsetWidth)*100;;
        const a1per = Math.max(0,100 - a2per);
        
        a1Root.style.width = "-moz-calc(" + a1per + "% " + splitData + " )";
        a1Root.style.width = "-webkit-calc( " + a1per + "% " + splitData + " )";
        a1Root.style.width = "calc( " + a1per + "% " + splitData + " )";
        a2Root.style.width = "-moz-calc(" + a2per + "% )";
        a2Root.style.width = "-webkit-calc( " + a2per + "% )";
        a2Root.style.width = "calc( " + a2per + "% )";

        if( a1.maxWidth != Infinity ) a2Root.style.minWidth = "calc( 100% - " + parseInt( a1.maxWidth ) + "px" + " )";
    }
    else
    {
        var size = Math.max((a2Root.offsetHeight + dt) + a2.offset, parseInt(a2.minHeight));
        if( forceWidth ) size = forceWidth;
        const a2per = Math.max(0, size / this.root.offsetHeight)*100;;
        const a1per = Math.max(0,100 - a2per);
        
        a1Root.style.height = "-moz-calc(" + a1per + "% " + splitData + " )";
        a1Root.style.height = "-webkit-calc( " + a1per + "% " + splitData + " )";
        a1Root.style.height = "calc( " + a1per + "% " + splitData + " )";
        a2Root.style.height = "-moz-calc(" + a2per + "% )";
        a2Root.style.height = "-webkit-calc( " + a2per + "% )";
        a2Root.style.height = "calc( " + a2per + "% )";
    }

    if( !forceAnimation )
    {
        // Reapply transitions
        a1Root.style.transition = a2Root.style.transition = transition;
    }

    this._update();

    // Resize events
    this.propagateEvent( 'onresize' );
}

function flushCss(element) {
    // By reading the offsetHeight property, we are forcing
    // the browser to flush the pending CSS changes (which it
    // does to ensure the value obtained is accurate).
    element.offsetHeight;
}
// ----- END OF - FIX AREA RESIZE THROUGH SPLIT BAR ----- 



// ----- BUG: NODETREE REFRESH ON ARRAY -----
// A tree widget accepts either an object, meaning a single heriarchy; or an array of objects, where each is a heriarchy.
// The nodetree refresh function does not take into account the possibility of arrays, unlike the constructor which does.
// Added also "LX.NodeTree = NodeTree;" line in lexgui.module.js
// LX.NodeTree.prototype.refresh = function( newData, selectedId ) {

//     this.data = newData ?? this.data;
//     this.domEl.querySelector( "ul" ).innerHTML = "";
//     if( this.data.constructor === Object )
//     {
//         this._createItem( null, this.data, 0, selectedId );
//     }
//     else
//     {
//         for( let d of this.data )
//         {
//             this._createItem( null, d, 0, selectedId );
//         }
//     }
// }
// ----- END OF - NODETREE REFRESH ON ARRAY -----


// ----- NODETREE SELECT -----

// Calling select does not open the tree. It only selects if the entry is already present in the dom.
// This fixes it by finding the requested id in the data and opening all parents. It then selects the dom element
// TODO if a findId is needed, the selection could be done already in the createItem of the refresh. Currently, createItem ignores this attribute (in terms of selecting it)
LX.NodeTree.prototype.select = function (id) {
    this.refresh(null, id);
    this.domEl.querySelectorAll(".selected").forEach((i) => i.classList.remove("selected"));
    this.selected.length = 0;
    var el = this.domEl.querySelector("#" + id);
    if(!el){
      function findId (node, id){
        if ( node.id == id ){
          return true;
        }
        for(let i = 0; i < node.children.length; ++i){
          if( findId(node.children[i], id) ){
            node.closed = false;
            return true;
          }
        }
        return false;
      }

      findId(this.data, id);
      this.refresh(this.data,id);
      el = this.domEl.querySelector("#" + id);
    }
    
    el.classList.add("selected");
    this.selected = [el.treeData];
    el.focus();
    
  }

// ----- END OF - NODETREE SELECT


export{};