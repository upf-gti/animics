// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';

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