// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';


// FIX 1
// asset view scrol broken

LX.AssetView.prototype._createContentPanel = function( area ) {

    if( this.toolsPanel )
    {
        this.contentPanel.clear();
    }
    else
    {
        area.root.classList.add("flex"); // <-- added this
        area.root.classList.add("flex-col"); // <-- added this
        this.toolsPanel = area.addPanel({ className: 'flex flex-col overflow-hidden', height:"auto" });
        this.toolsPanel.root.style.flex = "none"; // <-- added this
        this.contentPanel = area.addPanel({ className: 'lexassetcontentpanel flex flex-col overflow-hidden' });
    }

    const _onSort = ( value, event ) => {
        new LX.DropdownMenu( event.target, [
            { name: "Name", icon: "ALargeSmall", callback: () => this._sortData( "id" ) },
            { name: "Type", icon: "Type", callback: () => this._sortData( "type" ) },
            null,
            { name: "Ascending", icon: "SortAsc", callback: () => this._sortData( null, LX.AssetView.CONTENT_SORT_ASC ) },
            { name: "Descending", icon: "SortDesc", callback: () => this._sortData( null, LX.AssetView.CONTENT_SORT_DESC ) }
        ], { side: "right", align: "start" });
    };

    const _onChangeView = ( value, event ) => {
        new LX.DropdownMenu( event.target, [
            { name: "Grid", icon: "LayoutGrid", callback: () => this._setContentLayout( LX.AssetView.LAYOUT_GRID ) },
            { name: "List", icon: "LayoutList", callback: () => this._setContentLayout( LX.AssetView.LAYOUT_LIST ) }
        ], { side: "right", align: "start" });
    };

    const _onChangePage = ( value, event ) => {
        if( !this.allowNextPage )
        {
            return;
        }
        const lastPage = this.contentPage;
        this.contentPage += value;
        this.contentPage = Math.min( this.contentPage, (((this.currentData.length - 1) / LX.AssetView.MAX_PAGE_ELEMENTS )|0) + 1 );
        this.contentPage = Math.max( this.contentPage, 1 );

        if( lastPage != this.contentPage )
        {
            this._refreshContent();
        }
    };

    this.toolsPanel.refresh = () => {
        this.toolsPanel.clear();
        this.toolsPanel.sameLine();
        this.toolsPanel.addSelect( "Filter", this.allowedTypes, this.filter ?? this.allowedTypes[ 0 ], v => {
            this._refreshContent( null, v );
        }, { width: "30%", minWidth: "128px", overflowContainer: null } );
        this.toolsPanel.addText( null, this.searchValue ?? "", v => this._refreshContent.call(this, v, null), { placeholder: "Search assets.." } );
        this.toolsPanel.addButton( null, "", _onSort.bind(this), { title: "Sort", tooltip: true, icon: ( this.sortMode === LX.AssetView.CONTENT_SORT_ASC ) ? "SortAsc" : "SortDesc" } );
        this.toolsPanel.addButton( null, "", _onChangeView.bind(this), { title: "View", tooltip: true, icon: ( this.layout === LX.AssetView.LAYOUT_GRID ) ? "LayoutGrid" : "LayoutList" } );
        // Content Pages
        this.toolsPanel.addButton( null, "", _onChangePage.bind(this, -1), { title: "Previous Page", icon: "ChevronsLeft", className: "ml-auto" } );
        this.toolsPanel.addButton( null, "", _onChangePage.bind(this, 1), { title: "Next Page", icon: "ChevronsRight" } );
        const textString = "Page " + this.contentPage + " / " + ((((this.currentData.length - 1) / LX.AssetView.MAX_PAGE_ELEMENTS )|0) + 1);
        this.toolsPanel.addText(null, textString, null, {
            inputClass: "nobg", disabled: true, signal: "@on_page_change", maxWidth: "16ch" }
        );
        this.toolsPanel.endLine();

        if( !this.skipBrowser )
        {
            this.toolsPanel.sameLine();
            this.toolsPanel.addComboButtons( null, [
                {
                    value: "Left",
                    icon: "ArrowLeft",
                    callback: domEl => {
                        if(!this.prevData.length) return;
                        this.nextData.push( this.currentData );
                        this.currentData = this.prevData.pop();
                        this._refreshContent();
                        this._updatePath( this.currentData );
                    }
                },
                {
                    value: "Right",
                    icon: "ArrowRight",
                    callback: domEl => {
                        if(!this.nextData.length) return;
                        this.prevData.push( this.currentData );
                        this.currentData = this.nextData.pop();
                        this._refreshContent();
                        this._updatePath( this.currentData );
                    }
                },
                {
                    value: "Refresh",
                    icon: "Refresh",
                    callback: domEl => { this._refreshContent(); }
                }
            ], { noSelection: true } );

            this.toolsPanel.addText(null, this.path.join('/'), null, {
                inputClass: "nobg", disabled: true, signal: "@on_folder_change",
                style: { fontWeight: "600", fontSize: "15px" }
            });

            this.toolsPanel.endLine();
        }
    };

    this.toolsPanel.refresh();

    // Start content panel

    this.content = document.createElement('ul');
    this.content.className = "lexassetscontent";
    this.contentPanel.attach( this.content );

    this.content.addEventListener('dragenter', function( e ) {
        e.preventDefault();
        this.classList.add('dragging');
    });
    this.content.addEventListener('dragleave', function( e ) {
        e.preventDefault();
        this.classList.remove('dragging');
    });
    this.content.addEventListener('drop', ( e ) => {
        e.preventDefault();
        this._processDrop( e );
    });
    this.content.addEventListener('click', function() {
        this.querySelectorAll('.lexassetitem').forEach( i => i.classList.remove('selected') );
    });

    this._refreshContent();
}
//  END OF FIX 1


// FIX 2 
// Cannot properly clear signals from a codeeditor
import "lexgui/extensions/codeeditor.js"
LX.CodeEditor.prototype.clear = function(){
    this.rightStatusPanel.clear();
    this.leftStatusPanel.clear();
}

LX.CodeEditor.prototype._createStatusPanel = function( options ) {

    if( this.skipInfo )
    {
        return;
    }

    let panel = new LX.Panel({ className: "lexcodetabinfo flex flex-row", height: "auto" });

    if( this.onCreateStatusPanel )
    {
        this.onCreateStatusPanel( panel, this );
    }

    let leftStatusPanel = this.leftStatusPanel = new LX.Panel( { id: "FontSizeZoomStatusComponent", height: "auto" } );
    leftStatusPanel.sameLine();

    if( this.skipTabs )
    {
        leftStatusPanel.addButton( null, "ZoomOutButton", this._decreaseFontSize.bind( this ), { icon: "ZoomOut", width: "32px", title: "Zoom Out", tooltip: true } );
    }

    leftStatusPanel.addButton( null, "ZoomOutButton", this._decreaseFontSize.bind( this ), { icon: "ZoomOut", width: "32px", title: "Zoom Out", tooltip: true } );
    leftStatusPanel.addLabel( this.fontSize ?? 14, { fit: true, signal: "@font-size" });
    leftStatusPanel.addButton( null, "ZoomInButton", this._increaseFontSize.bind( this ), { icon: "ZoomIn", width: "32px", title: "Zoom In", tooltip: true } );
    leftStatusPanel.endLine( "justify-start" );
    panel.attach( leftStatusPanel.root );

    let rightStatusPanel = this.rightStatusPanel = new LX.Panel( { height: "auto" } );
    rightStatusPanel.sameLine();
    rightStatusPanel.addLabel( this.code?.title ?? "", { id: "EditorFilenameStatusComponent", fit: true, signal: "@tab-name" });
    rightStatusPanel.addButton( null, "Ln 1, Col 1", this.showSearchLineBox.bind( this ), { id: "EditorSelectionStatusComponent", fit: true, signal: "@cursor-data" });
    rightStatusPanel.addButton( null, "Spaces: " + this.tabSpaces, ( value, event ) => {
        LX.addContextMenu( "Spaces", event, m => {
            const options = [ 2, 4, 8 ];
            for( const n of options )
                m.add( n, (v) => {
                    this.tabSpaces = v;
                    this.processLines();
                    this._updateDataInfoPanel( "@tab-spaces", "Spaces: " + this.tabSpaces );
                } );
        });
    }, { id: "EditorIndentationStatusComponent", nameWidth: "15%", signal: "@tab-spaces" });
    rightStatusPanel.addButton( "<b>{ }</b>", this.highlight, ( value, event ) => {
        LX.addContextMenu( "Language", event, m => {
            for( const lang of Object.keys( CodeEditor.languages ) )
            {
                m.add( lang, v => {
                    this._changeLanguage( v, null, true )
                } );
            }
        });
    }, { id: "EditorLanguageStatusComponent", nameWidth: "15%", signal: "@highlight" });
    rightStatusPanel.endLine( "justify-end" );
    panel.attach( rightStatusPanel.root );


    const itemVisibilityMap = {
        "Font Size Zoom": options.statusShowFontSizeZoom ?? true,
        "Editor Filename": options.statusShowEditorFilename ?? true,
        "Editor Selection": options.statusShowEditorSelection ?? true,
        "Editor Indentation": options.statusShowEditorIndentation ?? true,
        "Editor Language": options.statusShowEditorLanguage ?? true,
    };

    const _setVisibility = ( itemName ) => {
        const b = panel.root.querySelector( `#${ itemName.replaceAll( " ", "" ) }StatusComponent` );
        console.assert( b, `${ itemName } has no status button!` );
        b.classList.toggle( "hidden", !itemVisibilityMap[ itemName ] );
    }

    for( const [ itemName, v ] of Object.entries( itemVisibilityMap ) )
    {
        _setVisibility( itemName );
    }

    panel.root.addEventListener( "contextmenu", (e) => {

        if( e.target && ( e.target.classList.contains( "lexpanel" ) || e.target.classList.contains( "lexinlinecomponents" ) ) )
        {
            return;
        }

        const menuOptions = Object.keys( itemVisibilityMap ).map( ( itemName, idx ) => {
            const item = {
                name: itemName,
                icon: "Check",
                callback: () => {
                    itemVisibilityMap[ itemName ] = !itemVisibilityMap[ itemName ];
                    _setVisibility( itemName );
                }
            }
            if( !itemVisibilityMap[ itemName ] ) delete item.icon;
            return item;
        } );
        new LX.DropdownMenu( e.target, menuOptions, { side: "top", align: "start" });
    } );

    return panel;
}

// END OF FIX 2

export{};