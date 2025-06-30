import { UTILS } from "./Utils.js";
import * as THREE from "three";
import { LX } from 'lexgui';
import 'lexgui/components/codeeditor.js';
import 'lexgui/components/timeline.js';
import { Gizmo } from "./Gizmo.js";
import { KeyframeEditor } from "./Editor.js";

class Gui {

    constructor( editor)  {
       
        this.editor = editor;

        this.timelineVisible = false;

        // Create menu bar
        this.createMenubar(editor.editorArea);

        [this.menubarArea, this.mainArea] = editor.editorArea.sections;
        // split main area
        this.mainArea.split({sizes:["80%","20%"], minimizable: true});

        //left -> canvas, right -> side panel
        var [left, right] = this.mainArea.sections;
        left.id = "canvasarea";
        left.root.style.position = "relative";
        right.id = "sidepanel";
        this.mainArea.splitBar.style.zIndex = right.root.style.zIndex = 1;
        [this.canvasArea, this.timelineArea] = left.split({sizes: ["80%", "20%"], minimizable: true, type: "vertical"});
        this.canvasAreaOverlayButtons = null;
        this.sidePanel = right;
   
        //Create timelines (keyframes and clips)
        this.createTimelines( );        
    }

    init( showGuide ) {       

        this.createSidePanel();
    
        this.showTimeline();
        
        // Canvas UI buttons
        this.createSceneUI(this.canvasArea);

        this.editor.setTimeline();

        window.addEventListener("keydown", (event) => {
            if( event.key == "Escape" ) {
                this.closeDialogs(); 
            }
        })
        
        if(showGuide) {
            this.showGuide();
        }

        this.setColorTheme(LX.getTheme());
    }

    showGuide() {
        
    }

    onCreateMenuBar( entries ) {
        
    }

    setColorTheme(scheme = "light"){
        LX.setTheme(scheme);

        // Images are for dark mode. Applying a filter to adjust to light mode
        const faceAreas = document.getElementById("faceAreasContainer");
        if ( faceAreas ){
            faceAreas.style.filter = scheme == "dark" ? "" : "invert(1) saturate(1) hue-rotate(180deg)";
        }

        this.editor.scene.background.set(this.editor.theme[scheme].background);
        this.editor.scene.getObjectByName("Grid").material.color.set(this.editor.theme[scheme].grid);
        // this.editor.scene.getObjectByName("Grid").material.opacity.set(this.editor.theme[scheme].girdOpacity);
    }

    /** Create menu bar */
    createMenubar(area) {

        const menuEntries = [
            {
                name: "Project",
                submenu: [ ]
            },
            {
                name: "Timeline",
                submenu: [
                    {
                        name: "Shortcuts",
                        icon: "Keyboard",
                        submenu: [
                            { name: "Play-Pause", kbd: "SPACE" },
                            { name:"Zoom", kbd: "Hold LSHIFT+Wheel" },
                            { name: "Scroll", kbd: "Wheel" },
                            { name: "Move Timeline", kbd: "Left Click+Drag" }
                        ]
                    },
                    { name: "Clear Tracks", icon: "Trash2", callback: () => this.editor.clearAllTracks() }
                ]
            },
            {
                name: "View",
                submenu: [
                        { 
                            name: "Theme", icon: "Palette", 
                            submenu: [
                            { name: "Light", icon: "Sun", callback: () => this.setColorTheme("light") },
                            { name: "Dark", icon: "Moon", callback: () => this.setColorTheme("dark") }
                        ] 
                    }
                ]
            },
            {
                name: "About", submenu: []
            }
        ]

        this.menubar = area.addMenubar(menuEntries);
        const menubar = this.menubar;     
        
        LX.addSignal( "@on_new_color_scheme", (el, value) => {
            //TO DO delete the current line and uncomment the getButton once lexgui is updated
            // this.menubar.getButton("Animics"); 
            this.menubar.root.children[0].children[0].children[0].src = value == "light" ? "data/imgs/logos/animics_logo_lightMode.png" : "data/imgs/logos/animics_logo.png";
        } )
        
        const colorScheme = document.documentElement.getAttribute( "data-theme" );
        menubar.setButtonImage("Animics", colorScheme == "light" ? "data/imgs/logos/animics_logo_lightMode.png" : "data/imgs/logos/animics_logo.png", () => window.open(window.location.origin).focus(), {float: "left"});

        this.onCreateMenuBar(menuEntries);
        
        menubar.addButtons( [
            {
                title: "Play",
                icon: "Play@solid",
                swap: "Pause@solid",
                callback:  (swapValue, event) => { 
                    if(this.editor.state ) {
                        this.editor.pause();    
                    }
                    else {
                        this.editor.play();
                    }
                    if ( this.editor.activeTimeline ) {
                        this.editor.activeTimeline.setState( this.editor.state, true );
                    };
                }
            },
            {
                title: "Stop",
                icon: "Stop@solid",
                callback:  (value, event) => { 

                    this.editor.stop();
                    this.menubar.getButton("Play").setState(false, true); 
                    if ( this.editor.activeTimeline ) {
                        this.editor.activeTimeline.setState(false, true);
                    };

                }
            },
            {
                title: 'Animation loop',
                selectable: true,
                selected: this.editor.animLoop,
                icon: 'RefreshCw',
                callback: (value, event) =>  {
                    this.updateLoopModeGui( !this.editor.animLoop );
                }
            }
        ]);
        
        const user = this.editor.remoteFileSystem.session ? this.editor.remoteFileSystem.session.user : "" ;
        const loginName = (!user || user.username == "guest") ? "Login" : user.username;

        const loginButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto bg-accent fg-white hover:bg-mix self-center content-center text-center cursor-pointer select-none", "Login", menubar.root );
        loginButton.tabIndex = "1";
        loginButton.role = "button";
        loginButton.listen( "click", () => {
            const session = this.editor.remoteFileSystem.session;
            const username = session ? session.user.username : "guest";
            if( this.prompt && this.prompt.root.checkVisibility() ) {
                return;
            }
            if( username == "guest" ) {
                this.showLoginModal();
            }
        } );

        loginButton.id = "login-button"
    
        const userButton = LX.makeContainer( ["100px", "auto"], "lexcontainer text-lg font-semibold rounded-lg p-2 ml-auto fg-white hover:fg-primary self-center content-center text-center cursor-pointer select-none", loginName, menubar.root );
        userButton.tabIndex = "1";
        userButton.role = "button";
        userButton.listen( "click", () => {
            new LX.DropdownMenu( userButton, [
                
                { name: "Go to Database", icon: "Server", callback: () => { window.open("https://signon-lfs.gti.sb.upf.edu/src/", "_blank")} },
                { name: "Logout", icon: "LogOut", callback: () => { 
                    this.editor.remoteFileSystem.logout(() => {
                        this.editor.remoteFileSystem.login("guest", "guest", () => {
                            const folders = this.constructor == KeyframesGui ? ["clips"] : ["signs", "presets"];
                            this.editor.remoteFileSystem.loadAllUnitsFolders(null, folders);
                        })
                        this.changeLoginButton();
        
                    }); 
                } },
                
            ], { side: "bottom", align: "end" });
        } );									
        userButton.id = "user-button";

        this.changeLoginButton(loginName);
    }

    importFiles() {
        
        const input = document.createElement('input');
        input.type = 'file';
        input.click();

        input.onchange = (e) => {
            this.editor.loadFiles(e.currentTarget.files);
        }
    }

    changeLoginButton( username = "Login" ) {
        const loginButton = document.getElementById("login-button");
        const userButton = document.getElementById("user-button");

        if( username == "Login" || username == "guest") {
            loginButton.classList.remove("hidden");
            userButton.innerHTML = "";
            userButton.classList.add("hidden");
        }
        else {
            loginButton.classList.add("hidden");
            userButton.classList.remove("hidden");
            userButton.innerHTML = username;
        }
    }

    showLoginModal() {
        this.prompt = new LX.Dialog("Login", (p) => {
            let username = "";
            let password = "";
            const refresh = (p, msg) => {
                p.clear();
                if(msg) {
                    p.addText(null, msg, null, {disabled: true, warning: true,  className: "nobg"});
                }
                p.addText("User", username, (v) => {
                    username = v;
                });
                p.addText("Password", password, (v) => {
                    password = v;
                }, {type: "password"});
                p.sameLine(2);

                let b = p.addButton(null, "Cancel", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                });
                b.root.style.width = "50%";
    
                b = p.addButton(null, "Login", (v) => {
                    this.editor.remoteFileSystem.login(username, password, (session, response) => {
                        if(response.status == 1) {
                            this.changeLoginButton(session.user.username);
                            const folders = this.constructor == KeyframesGui ? ["clips"] : ["signs", "presets"] ;
                            this.editor.remoteFileSystem.loadAllUnitsFolders(null, folders);
                            this.prompt.close();
                            this.prompt = null;
                        }
                        else {                           
                            refresh(p, response.msg || "Can't connect to the server. Try again!");
                        }
                    });
                }, { buttonClass: "accent" });
                b.root.style.width = "50%";

                p.addButton(null, "Sign up", (v) => {
                    this.prompt.close();
                    this.prompt = null;
                    this.showCreateAccountDialog({username, password});
                })
            }
            refresh(p);
            
        }, {modal: true, closable: true} )

        this.prompt.onclose = () => {
            // this.editor.getDictionaries();
            this.prompt = null;
        }
  
    }

    showCreateAccountDialog(session = {user: "", password: ""})
    {
        let user = session.user, pass = session.password,
        pass2 = "", email = "";
        let errors = false;

        this.prompt = new LX.Dialog("Create account", (p) => {
        
            const refresh = (p, msg) => {
                p.clear();
                if(msg) {

                    let w = p.addText(null, msg, null, {disabled: true, warning: true});
                }
                p.addText("Username", user, (v) => { user = v; });
                p.addText("Email", email, (v) => { email = v; }, {type: "email"});
                p.addText("Password", pass, (v) => { pass = v; }, {type: "password"});
                p.addText("Confirm password",pass2, (v) => { pass2 = v; }, {type: "password"});
                p.addButton(null, "Register",  () => {
                    if(pass === pass2)
                    {
                        this.editor.remoteFileSystem.createAccount(user, pass, email, (request) => {
                            
                                this.prompt.close();
                                this.prompt = null;
                                let el = document.querySelector("#Login");
                                el.innerText = session.user;
                                // this.showLoginModal( { user: user, password: pass});
                            }, (request)  => {
                                refresh(p, "Server status: " + (request.msg ||  "Can't connect to the server. Try again!"));
                            }
                        );
                    }
                    else
                    {
                        refresh(p, "Please confirm password");
                        console.error("Wrong pass confirmation");
                    }
                }, { buttonClass: "accent" })
            }
            refresh(p);
        }, {modal: true, closable: true});
            
    }

    showExportAnimationsDialog(title, callback, options = { formats: [], folders: [], from: [] }) {
        options.modal = true;

        let value = "";
        let format = null;
        let folder = null;
        let from = null;
        const dialog = this.prompt = new LX.Dialog(title || "Export all animations", p => {
            
            const availableTable = this.createAvailableAnimationsTable();
            p.attach( availableTable );


            if ( options.from && options.from.length ) {
                from = from || options.selectedFrom || options.from[0];               
                const buttons = [];
                for(let i = 0; i < options.from.length; i++) {
                    buttons.push({ value: options.from[i], selected: options.from[i] == from, callback: (v) => {from = v} });
                }
                p.addComboButtons("Save from", buttons, {});
            }

            if( options.folders && options.folders.length ) {
                folder = folder || options.selectedFolder || options.folders[0];
                const buttons = [];
                for(let i = 0; i < options.folders.length; i++) {
                    buttons.push({ value: options.folders[i], selected: options.folders[i] == folder, callback: (v) => {folder = v} });
                }
                p.addComboButtons("Save in", buttons, {});
            }

            if( options.formats && options.formats.length ) {
                format = format || options.selectedFormat || options.formats[0];
                const buttons = [];
                for(let i = 0; i < options.formats.length; i++) {
                    buttons.push({ value: options.formats[i], selected: options.formats[i] == format, callback: (v) => {format = v} });
                }
                p.addComboButtons("Save as", buttons, {});
            }

            p.addNumber("Framerate (fps)", this.editor.animationFrameRate, (v) => {
                this.editor.animationFrameRate = v;
            }, {min: 1, disabled: false})

            p.sameLine(2);
            p.addButton("exportCancel", "Cancel", () => {if(options.on_cancel) options.on_cancel(); dialog.close();}, {hideName: true, width: "50%"} );
            p.addButton("exportOk", options.accept || "OK", (v, e) => { 
                e.stopPropagation();
                if(options.required && value === '') {

                    text += text.includes("You must fill the input text.") ? "": "\nYou must fill the input text.";
                    dialog.close() ;
                }
                else {
                    if( callback ) {
                        let selectedAnimations = [];
                        availableTable.getSelectedRows().forEach((v)=>{ selectedAnimations.push(v[0]) });
                        callback({selectedAnimations, format, folder, from});
                    }
                    dialog.close() ;
                }
                
            }, { buttonClass: "accent", hideName: true, width: "50%" });
        }, {modal: true, size: ["auto", "auto"]});

        // Focus text prompt
        if( options.input !== false ) {
            dialog.root.querySelector('input').focus();
        }
    }

    updateLoopModeGui( loop ){
        this.editor.setAnimationLoop(loop);
    
        if( this.skeletonTimeline ){
            this.skeletonTimeline.setLoopMode(loop, true);
        }
        if( this.auTimeline ){
            this.auTimeline.setLoopMode(loop, true);
        }
        if( this.clipsTimeline ){
            this.clipsTimeline.setLoopMode(loop, true);
        }
    }
    
    openSettings( settings ) {
        
        const prevDialog = document.getElementById("settings-dialog");
        if( prevDialog ) {
            prevDialog.remove();
        }
        
        const dialog = new LX.Dialog( UTILS.firstToUpperCase(settings), p => {
            if( settings == 'gizmo' ) {
                this.editor.gizmo.showOptions( p );
            }
        }, { id: 'settings-dialog', close: true, width: 380, height: 210, scroll: false, draggable: true});
    }

    /** -------------------- TIMELINE -------------------- */

    drawTimeline(currentTimeline) {

        if(this.timelineVisible){ currentTimeline.draw(); }
    }

    showTimeline() {
  
        this.timelineVisible = true;
        this.timelineArea.parentArea.reduce();
        this.editor.activeTimeline.show();
    }

    hideTimeline() {
   
        this.timelineVisible = false;
        this.timelineArea.parentArea.extend();        
        this.editor.activeTimeline.hide();
    }
    
    /** ------------------------------------------------------------ */

    /** -------------------- ON EVENTS -------------------- */

    resize(width, height) {
        //this.timelineArea.setSize([width, null]);
        if ( this.editor.activeTimeline ) { 
            this.editor.activeTimeline.resize();
            if( this.propagationWindow ) {
                this.propagationWindow.updateCurve(true);
            } // resize
        }
        this.mainArea._update(); // to update area's this.size attribute
    }

    showClearTracksConfirmation(callback) {
        this.prompt = new LX.prompt("Are you sure you want to delete all the tracks? You won't be able to restore the animation.", "Clear all tracks", callback, {input:false},  
        {
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
        } );
    }

    closeDialogs() {
        if(!LX.modal.hidden)
            LX.modal.toggle(true);
        if(this.prompt) {
            this.prompt.close();
            this.prompt = null;
            
        }
    }

    createLoadingModal(options) {
        options = options || {size: ["80%", "70%"]};

        return new LX.Dialog(null, m => {
            const div = document.createElement("div");
            div.classList.add("load")

            const icon = document.createElement("div");
            icon.classList = "loading-icon big";
            div.appendChild(icon);
            
            const text = document.createElement("div");
            text.innerText = "Loading content...";
            text.style.margin = "-5px 14px";
            div.appendChild(text);
            const area = new LX.Area(options);
            area.attach(div);
            m.attach(area);
        }, options);
    }

    // inserts an area that covers the panel with a loading message. Can be hidden/shown hidden. The new area's parent will have position:relative
    createLoadingArea(panel, options) {
        options = options ?? {size: ["100%", "100%"]};

        const div = document.createElement("div");
        div.classList.add("load");

        const icon = document.createElement("div");
        icon.classList = "loading-icon big";
        div.appendChild(icon);
        
        const text = document.createElement("div");
        text.innerText = "Loading content...";
        text.style.margin = "-5px 14px";
        div.appendChild(text);
        const area = new LX.Area(options);
        area.attach(div);

        area.root.style.minWidth = "100%";
        area.root.style.minHeight = "100%";
        area.root.style.top = 0;
        area.root.style.left = 0;
        area.root.style.position = "absolute";
        area.root.style.zIndex = 100;

        panel.attach(area);
        area.root.parentElement.style.position = "relative";
        return area;
    }

    highlightSelector( ) {
        const el = document.getElementById("animation-selector");
        if( el ) {
            el.getElementsByClassName("lexbutton")[0].classList.add("highlight-border");
        }
    }

    createCharactersPanel( panel = this.characterPanel ) {
        if(!panel) {
            return;
        }
        const p = this.characterPanel = panel;

        p.clear();
        p.branch('Characters');

        p.addButton( "Upload yours", "Upload Character", (v) => {
            this.uploadCharacter((value, config) => {
                    
                if ( !this.editor.loadedCharacters[value] ) {
                    UTILS.makeLoading( `Loading character [ ${value} ]...`);
                    let modelFilePath = this.editor.characterOptions[value][0];                    
                    let configFilePath = this.editor.characterOptions[value][1];
                    let modelRotation = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), this.editor.characterOptions[value][2] ); 
                    this.editor.loadCharacter(modelFilePath, config || configFilePath, modelRotation, value, ()=>{ 
                        this.editor.changeCharacter(value);
                        this.createCharactersPanel(p);
                        if(this.editor.currentCharacter.config) {
                          
                            
                            const resetBtn = this.mainArea.sections[0].panels[2].root.querySelector("button[title='Reset pose']");
                            if(resetBtn) {
                                resetBtn.classList.remove("hidden");
                            }
                        }
                        UTILS.hideLoading();
                    }, (err) => {
                        UTILS.hideLoading();
                        LX.popup("There was an error loading the character", "Character not loaded", {width: "30%"});
                    } );
                    return;
                } 

                // use controller if it has been already loaded in the past
                this.editor.changeCharacter(value);
                this.createCharactersPanel(p);
            });
        } ,{ nameWidth: "100px", icon: "CloudUpload" } );        
      
        p.addSeparator();


        // p.sameLine();
        let characters = [];
        const _makeProjectOptionItem = ( icon, outerText, id, parent, selected = false ) => {
            const item = LX.makeContainer( ["100%", "auto"], `flex flex-col gap-3 p-3 items-center text-md rounded-lg hover:bg-tertiary cursor-pointer ${selected ? "bg-tertiary" : "hover:scale"}`, ``, parent );
            const card = LX.makeContainer( ["200px", "auto"], `flex flex-col py-6 justify-center items-center content-center rounded-lg gap-3 card-button card-color`, `
               <img src="${icon}" height="120px">
            `, item );

            let button = null;
            if(selected) {
                button = new LX.Button(null, "Edit Character", (e) => {
                    this.createEditCharacterDialog(item.id);
                } ,{ icon: "UserRoundPen", className: "justify-center", width: "50px", buttonClass: "bg-secondary"} );

                button.root.addEventListener("click", (e) => {
                  
                    this.createEditCharacterDialog(item.id);
                })
            }
            const flexContainer = LX.makeContainer( ["auto", "auto"], "flex items-center", `<p>${ outerText }</p>`, item );
            if( selected ) {
                flexContainer.appendChild(button.root);
            }
            item.id = id;
            
            card.addEventListener("click", (e) => {               
                this.editor.changeCharacter(item.id);
            });

        };
        const characterContainer = LX.makeContainer( ["100%", "auto"], "grid gap-2", "" );
        characterContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(220px, 1fr))";
        for(let character in this.editor.characterOptions) {
            _makeProjectOptionItem(this.editor.characterOptions[character][3] ?? GUI.THUMBNAIL, character, character, characterContainer, character == this.editor.currentCharacter.model.name);
           
            characters.push({ value: character, src: this.editor.characterOptions[character][3] ?? GUI.THUMBNAIL});
            p.root.appendChild(characterContainer);
        }
    }

    createImportDialog(type, callback) {
        let isCharacter = false;
        const dialog = new LX.Dialog(type + " File Detected!", (panel) => {
            panel.sameLine();
            panel.addButton(null, "Use as Character", (v) => { isCharacter = true; dialog.close(); callback(isCharacter); });
            panel.addButton(null, "Use Animations only", (v) => { isCharacter = false; dialog.close(); callback(isCharacter);})
            panel.endLine();
        })
    }

    uploadCharacter(callback = null) {
        let name, model, config;
        let rotation = 0;
        
        let afromFile = true;
        let cfromFile = true;
        this.characterDialog = new LX.Dialog("Upload Character", panel => {

            panel.refresh = () => {
                panel.clear();
                
                let nameWidget = panel.addText("Name Your Character", name, (v, e) => {
                    if (this.editor.characterOptions[v]) LX.popup("This character name is taken. Please, change it.", null, { size: ["300px", "auto"], position: ["45%", "20%"]});
                    name = v;
                });

                panel.sameLine();
                let characterFile = panel.addFile("Character File", (v, e) => {
                    let files = panel.widgets["Character File"].domEl.children[1].files;
                    if(!files.length) {
                        return;
                    }
                    const path = files[0].name.split(".");
                    const filename = path[0];
                    const extension = path[1];
                    if (extension == "glb" || extension == "gltf") { 
                        model = v;
                        if(!name) {
                            name = filename;
                            nameWidget.set(name)
                        }
                    }
                    else { LX.popup("Only accepts GLB and GLTF formats!"); }
                }, {type: "url", nameWidth: "41%"});

                if(!afromFile) {
                    characterFile.domEl.classList.add('hidden');
                }

                let characterURL = panel.addText("Character URL", model, (v, e) => {
                    if(v == model) {
                        return;
                    }
                    if(!v) {
                        model = v;
                        return;
                    }

                    const path = v.split(".");
                    let filename = path[path.length-2];
                    filename = filename.split("/");
                    filename = filename.pop();
                    let extension = path[path.length-1];
                    extension = extension.split("?")[0];
                    if (extension == "glb" || extension == "gltf") { 
                        
                        model = v;                             
                        if(!name) {
                            name = filename;
                            nameWidget.set(name)
                        }
                        if(model.includes('models.readyplayer.me')) {
                           
                            const promptD = LX.prompt("It looks like you’re importing an character from a Ready Player Me. Would you like to use the default configuration for this character?\nPlease note that the contact settings may vary. We recommend customizing the settings based on the default to better suit your character.", 
                                                    "Ready Player Me detected!", (value, event)=> {
                                cfromFile = false;
                                panel.refresh();
                                panel.setValue("Config URL", Editor.RESOURCES_PATH+"ReadyEva/ReadyEva_v2.json");
                                
                            },{input: false, fitHeight: true})                            
                        }
                    }
                    else { LX.popup("Only accepts GLB and GLTF formats!"); }
                }, {nameWidth: "43%"});
                if(afromFile) {
                    characterURL.domEl.classList.add('hidden');
                }

                panel.addComboButtons(null, [
                    {
                        value: "From File",
                        callback: (v, e) => {                            
                            afromFile = true;
                            if(!characterURL.domEl.classList.contains('hidden')) {
                                characterURL.domEl.classList.add('hidden');          
                            }
                            characterFile.domEl.classList.remove('hidden');                                                          
                            panel.refresh();
                        }
                    },
                    {
                        value: "From URL",
                        callback: (v, e) => {
                            afromFile = false;
                            if(!characterFile.domEl.classList.contains('hidden')) {
                                characterFile.domEl.classList.add('hidden');           
                            }                                               
                            characterURL.domEl.classList.remove('hidden');          
                        }
                    }
                ], {selected: afromFile ? "From File" : "From URL", width: "170px", minWidth: "0px"});                
                panel.endLine();
            
                panel.sameLine();
                let configFile = panel.addFile("Config File", (v, e) => {
                
                    if(!v) {
                        return;
                    }
                    const filename = panel.widgets["Config File"].domEl.children[1].files[0].name;
                    let extension = filename.split(".");
                    extension = extension.pop();
                    if (extension == "json") { 
                        config = JSON.parse(v); 
                        config._filename = filename; 
                        editConfigBtn.classList.remove('hidden');
                    }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {type: "text", nameWidth: "100%"});
                
                let configURL = panel.addText("Config URL", config ? config._filename : "", async (v, e) => {
                    if(!v) {
                        config = v;
                        return;
                    }
                    const path = v.split(".");
                    let filename = path[path.length-2];
                    filename = filename.split("/");
                    filename = filename.pop();
                    let extension = path[path.length-1];
                    extension = extension.split("?")[0].toLowerCase();
                    if (extension == "json") { 
                        if (extension == "json") { 
                            try {
                                const response = await fetch(v);
                                if (!response.ok) {
                                    throw new Error(`Response status: ${response.status}`);
                                }
                                config = await response.json();                        
                                config._filename = v; 
                                editConfigBtn.classList.remove('hidden');
                            }
                            catch (error) {
                                LX.popup(error.message, "File error!");
                            }
                        }
                    }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {nameWidth: "43%"});

                if(cfromFile) {
                    configURL.domEl.classList.add('hidden');
                }else {
                    configFile.domEl.classList.add('hidden');
                }
                
                const editConfigBtn = panel.addButton(null, "Edit config file", () => {
                    this.editor.openAtelier(name, model, config, true, rotation);

                }, {icon: "UserCog@solid", width: "40px"});
                
                if(!config) {
                    editConfigBtn.classList.add('hidden');
                }

                panel.addComboButtons(null, [
                    {
                        value: "From File",
                        callback: (v, e) => {                            
                            cfromFile = true;
                            // panel.refresh();
                            if(!configURL.domEl.classList.contains('hidden')) {
                                configURL.domEl.classList.add('hidden');          
                            }
                            configFile.domEl.classList.remove('hidden');                                                          
                        }
                    },
                    {
                        value: "From URL",
                        callback: (v, e) => {
                            cfromFile = false;
                            // panel.refresh();
                            if(!configFile.domEl.classList.contains('hidden')) {
                                configFile.domEl.classList.add('hidden');           
                            }                                               
                            configURL.domEl.classList.remove('hidden');  
                        }
                    }
                ], {selected: cfromFile ? "From File" : "From URL", width: "170px", minWidth: "0px"});

                panel.endLine();

            panel.addNumber("Apply Rotation", 0, (v) => {
                rotation = v * Math.PI / 180;
            }, { min: -180, max: 180, step: 1 } );
            
            panel.sameLine(2);
            panel.addButton(null, "Create Config File", () => {
                this.editor.openAtelier(name, model, config, true, rotation);
            })
            panel.addButton(null, "Upload", () => {
                if (name && model) {
                    if (this.editor.characterOptions[name]) { LX.popup("This character name is taken. Please, change it.", null, { position: ["45%", "20%"]}); return; }
                    let thumbnail = GUI.THUMBNAIL;
                    if( model.includes('models.readyplayer.me') ) {
                        model+= '?pose=T&morphTargets=ARKit&lod=1';
                        thumbnail =  "https://models.readyplayer.me/" + name + ".png?background=68,68,68";
                    }
                    if (config) {
                        this.editor.characterOptions[name] = [model, config, rotation, thumbnail];               
                        panel.clear();
                        this.characterDialog.root.remove();
                        this.editor.characterOptions[name][1] = config._filename;
                        if (callback) callback(name, config);
                    }
                    else {
                        LX.prompt("Uploading without config file will disable BML animations for this character. Do you want to proceed?", "Warning!", (result) => {
                            this.editor.characterOptions[name] = [model, null, rotation, thumbnail];
                            
                            panel.clear();
                            this.characterDialog.root.remove();
                            if (callback) callback(name);
                        }, {input: false, on_cancel: () => {}});
                        
                    }
                }
                else {
                    LX.popup("Complete all fields!", null, { position: ["45%", "20%"]});
                }
            });

            panel.root.addEventListener("drop", (v, e) => {

                let files = v.dataTransfer.files;
                this.onDropCharacterFiles(files);
            })
            
        }
        panel.refresh();

        }, { size: ["40%"], closable: true, onclose: (root) => {  root.remove(); }});

        return name;
    }

    createEditCharacterDialog() {
        let name = this.editor.currentCharacter.model.name;
        this.editCharacter(name, {
            callback: (newName, rotation, config) => {
                if(name != newName) {
                    this.editor.characterOptions[newName] = [ this.editor.characterOptions[name][0], this.editor.characterOptions[name][1], this.editor.characterOptions[name][2], this.editor.characterOptions[name][3]]
                    delete this.editor.characterOptions[name];
                    name = newName;
                    this.editor.currentCharacter.model.name = name;
                    this.refresh();
                }
                this.editor.characterOptions[name][2] = rotation;
                
                const modelRotation = (new THREE.Quaternion()).setFromAxisAngle( new THREE.Vector3(1,0,0), rotation ); 
                this.editor.currentCharacter.model.quaternion.premultiply( modelRotation );
                if(this.editor.currentCharacter.config && this.editor.currentCharacter.config == config) {
                    return;
                }
                this.editor.currentCharacter.config = config;
                if(config) {
                    this.editor.characterOptions[name][1] = config._filename;
                    // this.editor.scriptApp.onLoadCharacter(this.editor.currentCharacter.model, this.editor.currentCharacter.config, this.editor.currentCharacter.skeleton);
                    this.editor.currentCharacter.skeleton.pose();
                    this.editor.scriptApp.ECAcontroller.reset();                        
                    this.editor.changeMode(Performs.Modes.SCRIPT);
                    if(this.settingsActive) {
                        this.createSettingsPanel();             
                    }
                    const resetBtn = this.mainArea.sections[0].panels[2].root.querySelector("button[title='Reset pose']");
                    if(resetBtn) {
                        resetBtn.classList.remove("hidden");
                    }
                }

            }, 
            name, modelFilePath: this.editor.characterOptions[name][0], modelConfigPath: this.editor.characterOptions[name][1]
        });
    }

    editCharacter(name, options = {}) {
        const data = this.editor.currentCharacter;
        const callback = options.callback;
        let config = data.config;
        let rotation = 0;
        
        let fromFile = !config ?? false;
        this.characterDialog = new LX.Dialog("Edit Character", panel => {
          
            panel.refresh = () => {
                panel.clear();                
                let nameWidget = panel.addText("Name Your Character", name, (v, e) => {
                    if (this.editor.characterOptions[v]) LX.popup("This character name is taken. Please, change it.", null, { position: ["45%", "20%"]});
                    name = v;
                });

                panel.sameLine();

                let configFile = panel.addFile("Config File", (v, e) => {
                    if(!v) {
                        return;
                    }
                    const filename = panel.widgets["Config File"].domEl.children[1].files[0].name;
                    let extension = filename.split(".");
                    extension = extension.pop();
                    if (extension == "json") { 
                        config = JSON.parse(v); 
                        config._filename = filename; 
                    }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {type: "text"});

                let configURL = panel.addText("Config URL", config ? config._filename : "", async (v, e) => {
                    
                    if(!v) {
                        return;
                    }
                    const path = v.split(".");
                    let filename = path[path.length-2];
                    filename = filename.split("/");
                    filename = filename.pop();
                    let extension = path[path.length-1];
                    extension = extension.split("?")[0].toLowerCase();
                        if (extension == "json") { 
                            if (extension == "json") { 
                                try {
                                    const response = await fetch(v);
                                    if (!response.ok) {
                                        throw new Error(`Response status: ${response.status}`);
                                    }
                                    config = await response.json();                        
                                    config._filename = v; 
                                }
                                catch (error) {
                                    LX.popup(error.message, "File error!");
                                }
                            }
                        }
                    else { LX.popup("Config file must be a JSON!"); }
                }, {nameWidth: "43%",});

                if( fromFile ) {
                    configURL.root.classList.add('hidden');
                } else {
                    configFile.root.classList.add('hidden');
                }

                if( config ) {
                    panel.addButton(null, "Edit config file", () => {
                        this.editor.openAtelier(name, this.editor.characterOptions[name][0], config, false, rotation);                  
                    }, {icon: "UserCog@solid", width: "40px"});
                }

                panel.addComboButtons(null, [
                    {
                        value: "From File",
                        callback: (v, e) => {                            
                            fromFile = true;
                            // panel.refresh();
                            if(!configURL.root.classList.contains('hidden')) {
                                configURL.root.classList.add('hidden');          
                            }
                            configFile.root.classList.remove('hidden');                                                                                  
                        }
                    },
                    {
                        value: "From URL",
                        callback: (v, e) => {
                            fromFile = false;
                            // panel.refresh();
                            if(!configFile.root.classList.contains('hidden')) {
                                configFile.root.classList.add('hidden');           
                            }                                               
                            configURL.root.classList.remove('hidden');  
                        }
                    }
                    ]
                , {selected: fromFile ? "From File" : "From URL", width: "170px", minWidth: "0px"});
                panel.endLine();

                panel.addNumber("Apply Rotation", 0, (v) => {
                    rotation = v * Math.PI / 180;
                }, { min: -180, max: 180, step: 1 } );
                
                panel.sameLine(2);
                panel.addButton(null, (config ? "Edit": "Create") + " Config File", () => {
                    this.editor.openAtelier(name, this.editor.characterOptions[name][0], config, false, rotation);                                       
                })
                panel.addButton(null, "Update", () => {
                    if (name) {
                    
                        if (config) {
                            // this.editor.characterOptions[name][1] = config._filename;
                            // this.editor.characterOptions[name][2] = rotation;
                            
                            panel.clear();
                            this.characterDialog.root.remove();
                            if (callback) callback(name, rotation, config);
                        }
                        else {
                            LX.prompt("Uploading without config file will disable BML animations for this character. Do you want to proceed?", "Warning!", (result) => {
                                // this.editor.characterOptions[name][2] = rotation;
                                panel.clear();
                                this.characterDialog.root.remove();
                                if (callback) callback(name, rotation);
                            }, {input: false, on_cancel: () => {}});
                            
                        }
                    }
                    else {
                        LX.popup("Complete all fields!", null, { position: ["45%", "20%"]});
                    }
                });

                // panel.root.addEventListener("drop", (v, e) => {

                //     let files = v.dataTransfer.files;
                //     this.onDropCharacterFiles(files);
                // })
            
            }
            panel.refresh();

        }, { size: ["40%"], closable: true, onclose: (root) => {  root.remove(); }});

        return name;
    }
};

class KeyframesGui extends Gui {

    constructor(editor) {
        
        super(editor);
        this.showVideo = true; // menu option, whether to show video overlay (if any exists)
        this.skeletonScroll = 0;

        this.inputVideo = null;
        this.recordedVideo = null;
        this.canvasVideo = null;

        this.faceAreas = {
            "rgb(255,0,255)": "Brow Left",
            "rgb(0,0,255)": "Brow Right",
            "rgb(0,255,0)": "Eye Left",
            "rgb(0,255,255)": "Eye Right",
            "rgb(255,0,0)": "Nose", 
            "rgb(255,255,0)": "Cheek Left",
            "rgb(255,255,255)": "Cheek Right",
            "rgb(125,0,0)": "Mouth",
            "rgb(0,125,0)": "Jaw"
        };

        this.boneProperties = {};
        this.createVideoOverlay();       
    }

    onCreateMenuBar( entries ) {
        
        const projectMenu = entries.find( e => e.name == "Project" )?.submenu;
        console.assert(projectMenu, "Project menu not found" );

        projectMenu.push( 
            {
                name: "New Global Animation",
                icon: "Plus",
                callback: () => {
                    const animClip = this.editor.createGlobalAnimation("new animation", 1);
                    this.editor.setGlobalAnimation( animClip.id );
                }
            },
            null,
            "Clips",
            {
                name: "Empty clip",
                icon: "PenTool",
                callback: () =>{
                    // TODO empty clip probably does not need to have an entry in loadedAnimations
                    // however, not adding it might generate bugs. Some elements expect a clip to have a source
                    this.editor.loadAnimation("empty clip", {} ); 
                }
            },
            {
                name: "Import Animations",
                icon: "FileInput",
                submenu: [
                    { name: "From Disk", icon: "FileInput", callback: () => this.importFiles(), kbd: "CTRL+O" },
                    { name: "From Database", icon: "Database", callback: () => this.createServerClipsDialog(), kbd: "CTRL+I" }
                ]
            },
            {
                name: "Generate Animations", icon: "HandsAslInterpreting", submenu: [
                    { name: "From Webcam", icon: "Webcam", callback: () => this.editor.captureVideo() },
                    { name: "From Videos", icon: "Film", callback: () => this.importFiles(), short: "CTRL+O" }
                ]
            },
            null,

            // Export (download) animation
            { name: "Export Global Animations", icon: "Download", kbd: "CTRL+E", callback: () => {
                this.showExportAnimationsDialog("Export Animations", ( info ) => this.editor.export( info.selectedAnimations, info.format ), {formats: ["BVH", "BVH extended", "GLB"]});
            } },
            { name: "Export Videos and Landmarks", icon: "FileVideo", callback: () => this.showExportVideosDialog() },
            // Save animation in server
            { name: "Save Animation", icon: "Save", kbd: "CTRL+S", callback: () => this.createSaveDialog() },
            { name: "Preview in PERFORMS", icon: "StreetView", callback: () => this.editor.showPreview() },
        );
       
        const timelineMenu = entries.find( e => e.name == "Timeline" )?.submenu;
        console.assert(timelineMenu, "Timeline menu not found" );

        this.showVideo = this.showVideo ?? true; // menu option, whether to show video overlay (if any exists)

        timelineMenu.push( 
            null, 
            { name: "Optimize Tracks", icon: "Filter", callback: () => {
                // optimize all tracks of current bound animation (if any)
                this.auTimeline.optimizeTracks(); // onoptimizetracks will call updateActionUnitPanel
                this.skeletonTimeline.optimizeTracks();
            }},
            { name: "Show Video", checked: this.showVideo, callback: ( key, v, menuItem ) => {
                this.showVideo = v;
                this.editor.setVideoVisibility( v );
            }}
        );
        
        const shortcutsMenu = timelineMenu.find( e => e.name == "Shortcuts" )?.submenu;
        console.assert(shortcutsMenu, "Shortcuts menu not found" );

        shortcutsMenu.push(
            null,
            "Keys",
            { name: "Move", kbd: "Hold CTRL" },
            { name: "Change Value (face)", kbd: "ALT + Left Click + drag" },
            { name: "Add", kbd: "Right Click" },
            { name: "Copy", kbd: "CTRL+C" },
            { name: "Copy", kbd: "Right Click" },
            { name: "Paste", kbd: "CTRL+V" },
            { name: "Paste", kbd: "Right Click" },
            null,
            { name: "Delete Single", kbd: "DEL" },
            { name: "Delete Multiple", kbd: "Hold LSHIFT + DEL" },
            null,
            { name: "Select Single", kbd: "Left Click" },
            { name: "Select Multiple", kbd: "Hold LSHIFT" },
            { name: "Select Box", kbd: "Hold LSHIFT+Drag" },
            null,
            { name: "Propagation Window", kbd: "W" },
        );
        
        const viewMenu = entries.find( e => e.name == "View" )?.submenu;
        console.assert(viewMenu, "View menu not found" );
        viewMenu.push( null, { name: "Gizmo Settings", icon: "Axis3DArrows", callback: (v) => this.openSettings("gizmo") });

        const aboutMenu = entries.find( e => e.name == "About" )?.submenu;
        console.assert(aboutMenu, "About menu not found" );
        aboutMenu.push(
            { name: "Documentation", icon: "BookOpen", callback: () => window.open("https://animics.gti.upf.edu/docs/keyframe_animation.html", "_blank")},
            { name: "Github", icon: "Github", callback: () => window.open("https://github.com/upf-gti/animics", "_blank")}                                
        );
    }

    createBlendShapesInspector(bsNames, options = {}) {
        
        let inspector = options.inspector || new LX.Panel({id:"blendshapes-inspector"});
        
        if(options.clear)
            inspector.clear();
            
        if(inspector.id)
            inspector.addTitle(inspector.id);

        for(let name in bsNames) {
    
            inspector.addProgress(name, 0, {min: 0, max: 1, low: 0.3, optimum: 1, high: 0.6, editable: options.editable, showNumber: options.showNumber, signal: "@on_change_au_" + name});
        }
        
        return inspector;
    } 

    createVideoOverlay() {
        
        const width = 300;
        const height = 300;

        const area = new LX.Area({                
            id: "editor-video", draggable: true, resizeable: true, width: width + "px", height: height + "px", overlay:"left", left: "20px", top: "20px"
        });
        area.root.style.background = "#00000017";
        area.root.style.borderRadius = "5px";
        area.root.style.overflow = "none";
        
        const video = this.editor.video; 
        video.style.width = "99%";       
        video.style.height = "auto";
        // video.style.borderRadius = "5px";
       
        area.attach(video);
        this.canvasArea.attach(area);

        // adjust div to video aspect ratio. This forces the resizing tool to be on the video
        area.root.onmouseup = ( event ) => {
            // this == area
            const v = video;
            const aspectRatio = v.videoWidth / v.videoHeight;
            const currentRatio = area.root.clientWidth / area.root.clientHeight;
            if ( currentRatio < aspectRatio ){ // div higher than the video
                let lastHeight = area.root.clientHeight;
                let newHeight = area.root.clientWidth / aspectRatio;
                area.root.style.height = newHeight + "px";
                area.root.style.top = (area.root.offsetTop + 0.5 * ( lastHeight - newHeight ) ) + "px";            
            }
            else { // div wider than the video
                let lastWidth = area.root.clientWidth;
                let newWidth = area.root.clientHeight * aspectRatio;
                area.root.style.width = newWidth + "px";
                area.root.style.left = (area.root.offsetLeft + 0.5 * ( lastWidth - newWidth ) ) + "px";
            }

            this.computeVideoArea(event.rect);
        }
        this.hideVideoOverlay();
    }
    
    /**
     * 
     * @param {object} rect normalized rect coordinates { left, top, width, height } 
     * @returns 
     */
    computeVideoArea( rect ) {
        const videoRect = this.editor.video.getBoundingClientRect();
        if( !rect ) {
            rect = { left:0, top:0, width: 1, height: 1 };
        }

        this.editor.video.style.webkitMask = `linear-gradient(#000 0 0) ${rect.left * videoRect.width}px ${rect.top * videoRect.height}px / ${videoRect.width*rect.width}px ${videoRect.height*rect.height}px, linear-gradient(rgba(0, 0, 0, 0.3) 0 0)`;
        this.editor.video.style.webkitMaskRepeat = 'no-repeat';
    }

    showVideoOverlay( needsMirror = false ) {
        const el = document.getElementById("editor-video");
        if( el ) {
            el.classList.remove("hidden");
            const video = this.editor.video;
            
            // Mirror the video
            if( needsMirror ) {
                video.classList.add("mirror");
            }
            else {
                video.classList.remove("mirror");
            }
        }        
    }
    
    hideVideoOverlay() {
        const el = document.getElementById("editor-video");
        if( el ) {
            el.classList.add("hidden");
        }
    }

    showExportVideosDialog() {

        let animations = this.editor.loadedAnimations;
        let availableAnimations = []; // need to sepparate bvh anims from video anims (just in case)
        let availableVideoTypes = [];
        for ( let aName in animations ){
            if ( animations[aName].type == "video" ){
                availableAnimations.push([ aName,  animations[aName].videoExtension, (animations[aName].endTime - animations[aName].startTime).toFixed(3) ]);
                if ( availableVideoTypes.indexOf(animations[aName].videoExtension) == -1 ){
                    availableVideoTypes.push(animations[aName].videoExtension);
                }
            }
        }
        if( !availableAnimations.length ) {
            LX.popup("There aren't videos or landmarks to export!", "", {position: [ "10px", "50px"], timeout: 5000})
            return;
        }

        const zip = new JSZip();

        const options = { modal : true, width: "auto" };
        const dialog = this.prompt = new LX.Dialog("Export videos and Mediapipe data", p => {

            let table = p.addTable(null, {
                    head: ["Name",  "Video Format", "Duration (s)"],
                    body: availableAnimations
                },
                {
                    selectable: true,
                    sortable: true,
                    toggleColumns: true,
                    filter: "Name",
                    customFilters: [ {name: "Video Formats", options: availableVideoTypes } ]
                }
            );

            // accept / cancel
            p.sameLine(2);
            p.addButton(null, "Download", async (v, e) => { 
                e.stopPropagation();
                
                UTILS.makeLoading( "Preparing files...", 0.5 );
                const promises = [];

                let toExport = table.getSelectedRows();
                for( let i = 0; i < toExport.length; ++i ){
                    const animation = this.editor.loadedAnimations[toExport[i][0]];
                    const saveName = animation.name + animation.videoExtension;

                    // prepare videos so they can be downloaded
                    const promise = fetch( animation.videoURL )
                    .then( r => r.blob() )
                    .then( blob => UTILS.blobToBase64(blob) )
                    .then( binaryData => zip.file(saveName, binaryData, {base64:true} ) );

                    promises.push( promise );

                    // include landmarks in zip
                    // TODO: optimize json so it weights less
                    let data = {
                        startTime: animation.startTime,
                        endTime: animation.endTime,
                        landmarks: animation.landmarks,
                        blendshapes: animation.blendshapes
                    };

                    data = JSON.stringify( data, 
                        function(key, val) {
                            return (val !== null && val !== undefined && val.toFixed) ? Number(val.toFixed(4)) : val;
                        } 
                    );

                    zip.file( animation.name + ".json", data );
                }

                dialog.close();

                // wait until all videos have been added to the zip before downloading
                await Promise.all( promises );

                const base64 = await zip.generateAsync({type:"base64"});
                const el = document.createElement("a"); 
                el.href = "data:application/zip;base64," + base64;
                el.download = "videos.zip";
                el.click();
                UTILS.hideLoading();

            }, { buttonClass: "accent", width: "50%" });
            p.addButton(null, "Cancel", () => {
                dialog.close();
            }, { width: "50%" });

        }, options);

        // Focus text prompt
        if(options.input !== false) {
            dialog.root.querySelector('input').focus();
        }
    }

    /** Create timelines */
    createTimelines( ) {
        /* Global Timeline */
        this.globalTimeline = new LX.ClipsTimeline( "globalTimeline", {
            title: "Animation",
            skipLock: true,
            onCreateBeforeTopBar: (panel) => {
                // panel.addButton
                panel.addSelect("Animation", Object.keys(this.editor.boundAnimations), this.editor.currentAnimation, (v)=> {
                    this.editor.setGlobalAnimation(v); // already updates gui
                }, {signal: "@on_animation_loaded", id:"animation-selector", nameWidth: "auto"})
                
            },
            onCreateAfterTopBar: (panel) =>{
                panel.addNumber("Speed", + this.editor.playbackRate.toFixed(3), (value, event) => {
                    this.editor.setPlaybackRate(value);
                }, {
                    step: 0.01,
                    signal: "@on_set_speed",
                    nameWidth: "auto"
                });
            },
        });

        // TODO make it prettier and/or move cloning to timeline
        this.globalTimeline.cloneClips = function(clipsToClone, timeOffset){
            const cloned = JSON.parse( JSON.stringify( clipsToClone ) );
            for( let i = 0; i < cloned.length; ++i ){
                const sourceClip = clipsToClone[i];
                const c = cloned[i];
                c.source = sourceClip.source; // copy reference (if any)
                let tpg = c.skeletonAnimation.tracksPerGroup;
                for( let groupId in tpg ){
                    const arr = tpg[groupId];
                    for( let ti = 0; ti < arr.length; ++ti ){
                        arr[ti] = c.skeletonAnimation.tracks[ arr[ti].trackIdx ]; // redo references
                    }
                }
                c.skeletonAnimation.tracks.forEach((t,ti,arr) => { 
                    t.times = sourceClip.skeletonAnimation.tracks[ti].times.slice();
                    t.values = sourceClip.skeletonAnimation.tracks[ti].values.slice();
                } );
                tpg = c.auAnimation.tracksPerGroup;
                for( let groupId in tpg ){
                    const arr = tpg[groupId];
                    for( let ti = 0; ti < arr.length; ++ti ){
                        arr[ti] = c.auAnimation.tracks[ arr[ti].trackIdx ]; // redo references
                    }
                }
                c.auAnimation.tracks.forEach((t,ti,arr) => { 
                    t.times = sourceClip.auAnimation.tracks[ti].times.slice();
                    t.values = sourceClip.auAnimation.tracks[ti].values.slice();
                } );
                tpg = c.bsAnimation.tracksPerGroup;
                for( let groupId in tpg ){
                    const arr = tpg[groupId];
                    for( let ti = 0; ti < arr.length; ++ti ){
                        arr[ti] = c.bsAnimation.tracks[ arr[ti].trackIdx ]; // redo references
                    }
                }
                c.bsAnimation.tracks.forEach((t,ti,arr) => { 
                    t.times = sourceClip.bsAnimation.tracks[ti].times.slice();
                    t.values = sourceClip.bsAnimation.tracks[ti].values.slice();
                } );
                c.mixerFaceAnimation = clipsToClone[i].mixerFaceAnimation.clone(); // create new uuid
                c.mixerBodyAnimation = clipsToClone[i].mixerBodyAnimation.clone(); // create new uuid
                c.start = (c.start ?? 0) + timeOffset;
                if (c.hasOwnProperty("fadein") ){
                    c.fadein += timeOffset;
                }
                if (c.hasOwnProperty("fadeout") ){
                    c.fadeout += timeOffset;
                }
            }

            return cloned;
        }

        this.globalTimeline.onSetTrackState = (track, previousState) =>{
            if ( track.active == previousState ){ return; }

            for( let i = 0; i < track.clips.length; ++i ){
                track.clips[i].active = track.active; 
            }
            this.editor.globalAnimMixerManagement(this.editor.currentCharacter.mixer, this.editor.getCurrentBoundAnimation() );
            
            if ( this.globalTimeline.lastClipsSelected.length ){ // update toggle
                this.createSidePanel();
            }
        }

        this.globalTimeline.onDeleteSelectedClips = (deletedClips) =>{
            for( let i = 0; i < deletedClips.length; ++i ){
                const c = deletedClips[i];
                this.globalTimeline.onDeleteClip( c[0], c[1], c[2] );
            }
        }
        this.globalTimeline.onDeleteClip = ( trackIdx, clipIdx, clip )=>{
            const mixer = this.editor.currentCharacter.mixer;
            mixer.clipAction( clip.mixerBodyAnimation ).stop();
            mixer.clipAction( clip.mixerFaceAnimation ).stop();
            mixer.uncacheClip( clip.mixerBodyAnimation );
            mixer.uncacheClip( clip.mixerFaceAnimation );
        }

        this.globalTimeline.onDblClick = (e) => {
            const track = e.track;
            const localX = e.localX;
            if ( track ){
                const clipIdx = this.globalTimeline.getClipOnTime(track, this.globalTimeline.xToTime(localX), 0.001);
                if ( clipIdx != -1 ){
                    const animation = track.clips[clipIdx];
                    this.setKeyframeClip(animation);
                }
            }
        }

        this.globalTimeline.onContentMoved = (clip, deltaTime) => {
            clip.skeletonAnimation.duration = clip.duration;
            clip.auAnimation.duration = clip.duration;
            clip.bsAnimation.duration = clip.duration;
            clip.mixerBodyAnimation.duration = clip.duration;
            clip.mixerFaceAnimation.duration = clip.duration;
            this.editor.globalAnimMixerManagementSingleClip(this.editor.currentCharacter.mixer, clip);
        }
        this.globalTimeline.onAddNewTrack = (track, initData) =>{ track.id = "Track " + (this.globalTimeline.animationClip.tracks.length-1);}

        this.globalTimeline.onSetTime = (t) => {
            this.editor.setTime(t, true);
        }
        this.globalTimeline.onChangeLoopMode = (loop) => {
            this.updateLoopModeGui( loop );
        };
        this.globalTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").swap(); // click();
            }
        }
        this.globalTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").setState(true); // click();
        }

        this.globalTimeline.onSelectClip = (clip) => {
            this.createSidePanel();
        }


        /* Keyframes Timeline */
        this.skeletonTimeline = new LX.KeyFramesTimeline("Bone", {
            title: "Bone",
            onCreateAfterTopBar: (panel) =>{
                panel.addNumber("Speed", + this.editor.playbackRate.toFixed(3), (value, event) => {
                    this.editor.setPlaybackRate(value);
                }, {
                    step: 0.01,
                    signal: "@on_set_speed",
                    nameWidth: "auto"
                });
            },
            onCreateSettingsButtons: (panel) => {
                const closebtn = panel.addButton( null, "X", (e,v) =>{ 
                    this.setKeyframeClip(null);
                }, { tooltip: true, icon: "Undo2", title: "Return to global animation", buttonClass: "error fg-white" });

                panel.addButton("", "Clear track/s", (value, event) =>  {
                    this.editor.clearAllTracks();     
                }, {icon: 'Trash2', tooltip: true, title: "Clear Tracks"});
            },
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Num bones", Object.keys(this.skeletonTimeline.animationClip.tracksPerGroup).length, null, {disabled: true});
                dialog.addNumber("Num tracks", this.skeletonTimeline.animationClip ? this.skeletonTimeline.animationClip.tracks.length : 0, null, {disabled: true});
                dialog.addNumber("Optimize Threshold", this.skeletonTimeline.optimizeThreshold ?? 0.01, v => {
                        this.skeletonTimeline.optimizeThreshold = v;
                    }, {min: 0, max: 1, step: 0.001, precision: 4}
                );

                dialog.branch("Propagation Window");
                // this.propagationWindowConfig(dialog);
                this.propagationWindow.onOpenConfig(dialog);
                dialog.merge();
            },
            disableNewTracks: true
        });

        this.propagationWindow = new PropagationWindow( this.skeletonTimeline );

        this.skeletonTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.skeletonTimeline.onMouse = this.propagationWindow.onMouse.bind(this.propagationWindow);
        this.skeletonTimeline.onDblClick = this.propagationWindow.onDblClick.bind(this.propagationWindow);
        this.skeletonTimeline.onBeforeDrawContent = this.propagationWindow.draw.bind(this.propagationWindow);
        
        this.skeletonTimeline.onChangeLoopMode = (loop) => {
                this.updateLoopModeGui( loop );
        };
        this.skeletonTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").swap(); // click();
            }
        }
        this.skeletonTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").setState(true); // click();
        }
        this.skeletonTimeline.onSetTime = (t) => {
            this.editor.setTime(this.editor.startTimeOffset + t, true);
            this.propagationWindow.setTime(t);
        }
        this.skeletonTimeline.onSetDuration = (t) => { 
            const currentClip = this.editor.currentKeyFrameClip;
            if (!currentClip){ return; }
            currentClip.mixerBodyAnimation.duration = t;
            currentClip.mixerFaceAnimation.duration = t;

            if( this.auTimeline.duration != t ){
	            this.auTimeline.setDuration(t, true, true);
			}
            if( this.bsTimeline.duration != t ){
	            this.bsTimeline.setDuration(t, true, true);
			}

            currentClip.duration = t;
            if ( currentClip.start + currentClip.duration > this.globalTimeline.animationClip.duration ){
                this.globalTimeline.setDuration( currentClip.start + currentClip.duration, true, true );
            }
        };

        this.skeletonTimeline.onContentMoved = (trackIdx, keyframeIdx)=> this.editor.updateMixerAnimation( this.editor.currentKeyFrameClip.mixerBodyAnimation, [trackIdx]);
        this.skeletonTimeline.onDeleteKeyFrames = (trackIdx, indices) => this.editor.updateMixerAnimation( this.editor.currentKeyFrameClip.mixerBodyAnimation, [trackIdx]);
        this.skeletonTimeline.onSelectKeyFrame = (selection) => {
            this.propagationWindow.setTime( this.skeletonTimeline.currentTime );

            if ( this.skeletonTimeline.lastKeyFramesSelected.length < 2){   
                const track = this.skeletonTimeline.animationClip.tracks[selection[0]];
                this.editor.gizmo._setBoneById(this.editor.gizmo.selectedBone);
                this.editor.setGizmoMode(track ? track.id : "rotate");
                this.editor.gizmo.update(true);
                this.updateSkeletonPanel();
            }
            if ( this.propagationWindow.enabler ){
                this.skeletonTimeline.unSelectAllKeyFrames();
            }
        };

        this.skeletonTimeline.onUnselectKeyFrames = (keyframes) => {
            this.editor.gizmo.stop();
        }

        
        // "add" entry needs to set a proper value to the keyframe. This is why the default implementation of showContextMenu is not enough
        const that = this;
        this.skeletonTimeline.showContextMenu = function( e ) {
            // THIS here means the timeline, not the GUI
            e.preventDefault();
            e.stopPropagation();
    
            let actions = [];
            if(this.lastKeyFramesSelected && this.lastKeyFramesSelected.length) {
                actions.push(
                    {
                        title: "Copy",
                        callback: () => {
                            this.copySelectedContent();
                        }
                    }
                );
                actions.push(
                    {
                        title: "Delete",
                        callback: () => {
                            this.deleteSelectedContent();
                        }
                    }
                );
                if(this.lastKeyFramesSelected.length == 1 && this.clipboard && this.clipboard.value)
                {
                    actions.push(
                        {
                            title: "Paste Value",
                            callback: () => {
                                this.pasteContentValue();
                            }
                        }
                    );
                }
            }
            else{

                if(!e.track) {
                    return;
                }
                
                const type = e.track.id;
                if(that.boneProperties[type]) {
                    actions.push(
                        {
                            title: "Add Here",
                            callback: () => {
                                this.addKeyFrames( e.track.trackIdx,[0,0,0,1] /*that.boneProperties[type].toArray()*/, [this.xToTime(e.localX)] );
                            }
                        }
                    );
                    actions.push(
                        {
                            title: "Add",
                            callback: () => {
                                this.addKeyFrames( e.track.trackIdx, that.boneProperties[type].toArray(), [this.currentTime] );
                            }
                        }
                    );

                }    
            }
    
            if(this.clipboard && this.clipboard.keyframes)
            {
                actions.push(
                    {
                        title: "Paste Here",
                        callback: () => {
                            this.pasteContent( this.xToTime(e.localX) );
                        }
                    }
                );
                actions.push(
                    {
                        title: "Paste",
                        callback: () => {
                            this.pasteContent( this.currentTime );
                        }
                    }
                );
            }
            
            LX.addContextMenu("Options", e, (m) => {
                for(let i = 0; i < actions.length; i++) {
                    m.add(actions[i].title,  actions[i].callback )
                }
            });
    
        }

        this.skeletonTimeline.onItemSelected = (currentItems, addedItems, removedItems) => { if (currentItems.length == 0){ this.editor.gizmo.stop(); } }
        this.skeletonTimeline.onUpdateTrack = (indices) => this.editor.updateMixerAnimation( this.editor.currentKeyFrameClip.mixerBodyAnimation, indices.length == 1 ? [indices[0]] : []);
        this.skeletonTimeline.onSetTrackState = (track, oldState) => {this.editor.updateMixerAnimation( this.editor.currentKeyFrameClip.mixerBodyAnimation, [track.trackIdx] );}
        this.skeletonTimeline.onOptimizeTracks = (idx = null) => { 
            this.editor.updateMixerAnimation( this.editor.currentKeyFrameClip.mixerBodyAnimation, [idx]);
        }

        /* Curves Timeline */
        this.auTimeline = new LX.KeyFramesTimeline("Action Units", {
            title: "Action Units",
            onCreateAfterTopBar: (panel) =>{
                panel.addNumber("Speed", + this.editor.playbackRate.toFixed(3), (value, event) => {
                    this.editor.setPlaybackRate(value);
                }, {
                    step: 0.01,
                    signal: "@on_set_speed",
                    nameWidth: "auto"
                });
            },
            onCreateSettingsButtons: (panel) => {
                const closebtn = panel.addButton( null, "X", (e,v) =>{ 
                    this.setKeyframeClip(null);
                }, { tooltip: true, icon: "Undo2", title: "Return to global animation", buttonClass: "error fg-white" });

                panel.addButton("", "Clear track/s", (value, event) =>  {
                    this.editor.clearAllTracks();
                }, {icon: 'Trash2', tooltip: true, title: "Clear Tracks"});
            },
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Num Action Units", Object.keys(this.auTimeline.animationClip.tracksPerGroup).length, null, {disabled: true});
                dialog.addNumber("Num tracks", this.auTimeline.animationClip ? this.auTimeline.animationClip.tracks.length : 0, null, {disabled: true});
                dialog.addNumber("Optimize Threshold", this.auTimeline.optimizeThreshold ?? 0.01, v => {
                        this.auTimeline.optimizeThreshold = v;
                    }, {min: 0, max: 1, step: 0.001, precision: 4}
                );

                dialog.branch("Propagation Window");
                // this.propagationWindowConfig(dialog);
                this.propagationWindow.onOpenConfig(dialog);

                dialog.merge();
            },
            disableNewTracks: true
        });

        this.auTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.auTimeline.onMouse = this.propagationWindow.onMouse.bind(this.propagationWindow);
        this.auTimeline.onDblClick = this.propagationWindow.onDblClick.bind(this.propagationWindow);
        this.auTimeline.onBeforeDrawContent = this.propagationWindow.draw.bind(this.propagationWindow);

        this.auTimeline.onChangeLoopMode = (loop) => {
                this.updateLoopModeGui( loop );
        };
        this.auTimeline.onSetTime = (t) => {
            this.editor.setTime(this.editor.startTimeOffset + t, true);
            this.propagationWindow.setTime(t);
            if ( !this.editor.state ){ // update ui if not playing
                this.editor.updateFacePropertiesPanel(this.auTimeline, -1);
            }
        };
        this.auTimeline.onSetDuration = (t) => { 
            let currentClip = this.editor.currentKeyFrameClip;
            if (!currentClip){ return; }
            currentClip.mixerBodyAnimation.duration = t;
            currentClip.mixerFaceAnimation.duration = t;

            if( this.skeletonTimeline.duration != t ){
	            this.skeletonTimeline.setDuration(t, true, true);			
			}
            if( this.bsTimeline.duration != t ){
	            this.bsTimeline.setDuration(t, true, true);
			}

            currentClip.duration = t;
            if ( currentClip.start + currentClip.duration > this.globalTimeline.animationClip.duration ){
                this.globalTimeline.setDuration( currentClip.start + currentClip.duration, true, true );
            }
        };

        this.auTimeline.onContentMoved = (trackIdx, keyframeIdx)=> this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, [trackIdx], this.auTimeline.animationClip);
        this.auTimeline.onUpdateTrack = (indices) => {
            this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, indices.length == 1 ? indices : [], this.auTimeline.animationClip); 
            this.editor.updateFacePropertiesPanel(this.auTimeline, indices.length == 1 ? indices[0] : -1);
        }
        this.auTimeline.onDeleteKeyFrames = (trackIdx, tidx) => this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, [trackIdx], this.auTimeline.animationClip);
        this.auTimeline.onSelectKeyFrame = (selection) => {
            this.propagationWindow.setTime( this.auTimeline.currentTime );

            if ( this.auTimeline.lastKeyFramesSelected.length < 2 ){
                this.editor.updateFacePropertiesPanel(this.auTimeline, selection[0]);
            }

            if ( this.propagationWindow.enabler ){
                this.auTimeline.unSelectAllKeyFrames();
            }

            // Highlight panel slider
            const elements = document.getElementsByClassName("bg-accent");
            for(let el of elements) {
                el.classList.remove("bg-accent");
            }
            const el = document.querySelector(`[title='${this.auTimeline.animationClip.tracks[selection[0]].id}']`);

            if(el) {
                el.parentElement.classList.add("bg-accent");
            }
        };
        
        this.auTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").swap(); // click();
            }
        }
        this.auTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").setState(true); // click();
        }
        this.auTimeline.onOptimizeTracks = (idx = null) => { 
            this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, [idx], this.auTimeline.animationClip);
            this.editor.updateFacePropertiesPanel(this.auTimeline, idx < 0 ? -1 : idx);
        }
        this.auTimeline.onSetTrackState = (track, oldState) => {this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, [track.trackIdx], this.auTimeline.animationClip);}


        /* Curves Blendshapes Timeline */
        this.bsTimeline = new LX.KeyFramesTimeline("Blendshapes", { 
            title: "Blendshapes",
            onCreateAfterTopBar: (panel) =>{
                panel.addNumber("Speed", + this.editor.playbackRate.toFixed(3), (value, event) => {
                    this.editor.setPlaybackRate(value);
                }, {
                    step: 0.01,
                    signal: "@on_set_speed",
                    nameWidth: "auto"
                });
            },
            onCreateSettingsButtons: (panel) => {
                const closebtn = panel.addButton( null, "X", (e,v) =>{ 
                    this.setKeyframeClip(null);
                }, { icon: "Undo2", title: "Return to global animation", buttonClass: "error fg-white "});

                panel.addButton("", "Clear track/s", (value, event) =>  {
                    this.editor.clearAllTracks();     
                }, {icon: 'Trash2', tooltip: true, title: "Clear Tracks"});
            },
            onShowConfiguration: (dialog) => {             
                dialog.addNumber("Num tracks", this.bsTimeline.animationClip ? this.bsTimeline.animationClip.tracks.length : 0, null, {disabled: true});
                dialog.addNumber("Optimize Threshold", this.bsTimeline.optimizeThreshold ?? 0.01, v => {
                        this.bsTimeline.optimizeThreshold = v;
                    }, {min: 0, max: 1, step: 0.001, precision: 4}
                );

                dialog.branch("Propagation Window");
                // this.propagationWindowConfig(dialog);
                this.propagationWindow.onOpenConfig(dialog);

                dialog.merge();
            },
            disableNewTracks: true
        });

        this.bsTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.bsTimeline.onMouse = this.propagationWindow.onMouse.bind(this.propagationWindow);
        this.bsTimeline.onDblClick = this.propagationWindow.onDblClick.bind(this.propagationWindow);
        this.bsTimeline.onBeforeDrawContent = this.propagationWindow.draw.bind(this.propagationWindow);
        this.bsTimeline.onChangeLoopMode = (loop) => this.updateLoopModeGui( loop );
        this.bsTimeline.onSetSpeed = (v) => this.editor.setPlaybackRate(v);
        this.bsTimeline.onSetTime = (t) => {
            this.editor.setTime(this.editor.startTimeOffset + t, true);
            this.propagationWindow.setTime(t);
            if ( !this.editor.state ){ // update ui if not playing
                this.editor.updateFacePropertiesPanel(this.bsTimeline, -1);
            }
        }
        this.bsTimeline.onSetDuration = (t) => { 
            let currentClip = this.editor.currentKeyFrameClip;
            if (!currentClip){ return; }
            currentClip.mixerBodyAnimation.duration = t;
            currentClip.mixerFaceAnimation.duration = t;

            if( this.skeletonTimeline.duration != t ){
	            this.skeletonTimeline.setDuration(t, true, true);			
			}
            if( this.auTimeline.duration != t ){
	            this.auTimeline.setDuration(t, true, true);
			}

            currentClip.duration = t;
            if ( currentClip.start + currentClip.duration > this.globalTimeline.animationClip.duration ){
                this.globalTimeline.setDuration( currentClip.start + currentClip.duration, true, true );
            }
        };

        this.bsTimeline.onContentMoved = (trackIdx, keyframeIdx)=> {
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerFaceAnimation, [trackIdx]);
            this.editor.updateActionUnitsAnimation(this.editor.currentKeyFrameClip.auAnimation,  [trackIdx]);
            this.editor.updateFacePropertiesPanel(this.bsTimeline, [trackIdx]);
        }
        this.bsTimeline.onUpdateTrack = (indices) => {
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerFaceAnimation, indices.length == 1 ? indices : []);
            this.editor.updateActionUnitsAnimation(this.editor.currentKeyFrameClip.auAnimation, indices);
            this.editor.updateFacePropertiesPanel(this.bsTimeline, indices.length == 1 ? indices[0] : -1);
        }
        this.bsTimeline.onDeleteKeyFrames = (trackIdx, tidx) => {
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerFaceAnimation, [trackIdx]);
            this.editor.updateActionUnitsAnimation(this.editor.currentKeyFrameClip.auAnimation, [trackIdx]);
            this.editor.updateFacePropertiesPanel(this.bsTimeline, [trackIdx]);
        }
        
        this.bsTimeline.onGetSelectedItem = () => { return this.editor.getSelectedActionUnit(); };
        this.bsTimeline.onSelectKeyFrame = (selection) => {
            this.propagationWindow.setTime( this.bsTimeline.currentTime );

            if ( this.bsTimeline.lastKeyFramesSelected.length < 2){   
                this.editor.updateFacePropertiesPanel(this.bsTimeline, selection[0]);
            }
            if ( this.propagationWindow.enabler ){
                this.bsTimeline.unSelectAllKeyFrames();
            }
            
            // Highlight panel slider
            const elements = document.getElementsByClassName("bg-accent");
            for(let el of elements) {
                el.classList.remove("bg-accent");
            }
            const el = document.querySelector(`[title='${this.bsTimeline.animationClip.tracks[selection[0]].id}']`);

            if(el) {
                el.parentElement.classList.add("bg-accent");
            }     
        };
        
        this.bsTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").swap(); // click();
            }
        }
        this.bsTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").setState(true); // click();
        }
        this.bsTimeline.onOptimizeTracks = (idx = null) => { 
            this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerFaceAnimation, [idx]);
            this.editor.updateActionUnitsAnimation(this.editor.currentKeyFrameClip.auAnimation, [idx]);
            this.editor.updateFacePropertiesPanel(this.bsTimeline, idx < 0 ? -1 : idx);
        }
        this.bsTimeline.onSetTrackState = (track, oldState) => {this.editor.updateMixerAnimation(this.editor.currentKeyFrameClip.mixerFaceAnimation, [track.trackIdx]);}

        this.timelineArea.attach(this.globalTimeline.root);
        this.timelineArea.attach(this.skeletonTimeline.root);
        this.timelineArea.attach(this.auTimeline.root);
        this.timelineArea.attach(this.bsTimeline.root);
        this.skeletonTimeline.hide();
        this.auTimeline.hide();
        this.bsTimeline.hide();
        this.globalTimeline.show();
        this.editor.activeTimeline = this.globalTimeline;
    }

    setKeyframeClip(clip){
        if (!clip){
            this.editor.setTimeline(this.editor.animationModes.GLOBAL);
            this.editor.currentKeyFrameClip = null;
            // this.editor.gizmo.stop();
            // const skeleton = this.editor.scene.getObjectByName("SkeletonHelper");
            // skeleton.visible = false;
            // this.editor.scene.getObjectByName('GizmoPoints').visible = false;
            return;
        }

        const sourceAnimation = clip.source; // might not exist
        this.editor.currentKeyFrameClip = clip;
        
        const localTime = Math.max(0, Math.min( clip.duration, this.editor.currentTime - clip.start ) );
        this.editor.startTimeOffset = clip.start;
        this.skeletonTimeline.setAnimationClip(clip.skeletonAnimation, false);
        this.skeletonTimeline.setTime(localTime, true);
        this.skeletonTimeline.setSelectedItems([this.editor.selectedBone]);
        this.auTimeline.setAnimationClip(clip.auAnimation, false);
        this.auTimeline.setSelectedItems([this.editor.selectedAU]);
        this.auTimeline.setTime(localTime, true);
        this.bsTimeline.setAnimationClip(clip.bsAnimation, false);
        this.bsTimeline.setSelectedItems(Object.keys(clip.bsAnimation.tracks));
        this.bsTimeline.setTime(localTime, true);
        
        this.editor.animationMode = this.editor.animationModes.BODY;
        this.editor.setTime( clip.start + localTime );
        this.editor.setTimeline(this.editor.animationModes.BODY);
        this.propagationWindow.setTimeline( this.skeletonTimeline );

        if ( sourceAnimation && sourceAnimation.type == "video" ) {
            const video = this.editor.video;
            video.sync = true;
            this.editor.setVideoVisibility(this.showVideo);
            video.onloadeddata = () =>{
                video.currentTime = Math.max( video.startTime, Math.min( video.endTime, 0 ) );
                video.muted = true;
                video.click();
                const event = new Event("mouseup");
                
                if( sourceAnimation.rect ) {
                    event.rect = sourceAnimation.rect;
                }
                
                video.parentElement.dispatchEvent(event);
            }
            video.src = sourceAnimation.videoURL;
            video.startTime = sourceAnimation.startTime ?? 0;
            video.endTime = sourceAnimation.endTime ?? 1;
        }
        else {
            this.editor.video.sync = false;
            this.editor.setVideoVisibility(false);
        }

        
        // if(this.editor.animationMode == this.editor.animationModes.BODY) {
        //     const skeleton = this.editor.scene.getObjectByName("SkeletonHelper");
        //     skeleton.visible = this.editor.showSkeleton;
        //     this.editor.scene.getObjectByName('GizmoPoints').visible = this.editor.showSkeleton;
        //     this.editor.setSelectedBone(this.editor.selectedBone);
        //     if(!this.editor.showSkeleton) {
        //         this.editor.gizmo.stop();
        //     }
        // }
    }
    
    
    changeCaptureGUIVisivility(hidden) {
        this.bsInspector.root.hidden = hidden || !this.bsInspector.root.hidden;
    }

    updateCaptureGUI(results, isRecording) {
        // update blendshape inspector both in capture and edition stages

        let {landmarksResults, blendshapesResults} = results;
       

        if(landmarksResults) {
            this.bsInspector.get('Distance to the camera').onSetValue( landmarksResults.distanceToCamera ?? 0 );
            this.bsInspector.get('Left Hand visibility').onSetValue( landmarksResults.leftHandVisibility ?? 0 );
            this.bsInspector.get('Right Hand visibility').onSetValue( landmarksResults.rightHandVisibility ?? 0 );
        }        

        if(blendshapesResults && (!this.bsInspector.root.hidden || this.facePanel && !this.facePanel.root.hidden )) {

            for(let i in blendshapesResults)
            {
                
                let value = blendshapesResults[i];
                value = value.toFixed(2);
                let widget = this.bsInspector.root.hidden ? this.facePanel.tabs[this.facePanel.selected].get(i) : this.bsInspector.get(i);
                if(!widget)
                    continue;
                widget.onSetValue(value);
            // TO DO: emit @on_change_au_ + name
            }
        }
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {
        // clear area
        while ( this.sidePanel.root.children.length ){
            this.sidePanel.root.children[0].remove();
        }
        this.sidePanel.sections = [];

        if(this.panelTabs) {
            this.panelTabs.root.remove();
        }

        // Animation & Character tabs
        const panelTabs = this.panelTabs = this.sidePanel.addTabs({fit: true});

        // Animation tab content
        const animationArea = new LX.Area({id: 'Animation'});
        const [animSide, tabsSide] = animationArea.split({id: "panel", type: "vertical", sizes: ["auto", "auto"], resize: false});
        panelTabs.add( "Animation", animationArea, {selected: true, onSelect: (e,v) => {
            
        }});
        this.animationPanel = new LX.Panel({id: "animation", icon: "PersonStanding"});
        animSide.attach(this.animationPanel);
        this.updateAnimationPanel( );

        // Character tab content
        const characterArea = new LX.Area({id: 'Character'});
        const characterPanel = characterArea.addPanel();
        this.createCharactersPanel( characterPanel ) ;
        
        panelTabs.add( "Character", characterArea, {selected: false, onSelect: (e,v) => {
            
        }});


        // SIDE PANEL FOR GLOBAL TIMELINE
        if ( this.editor.activeTimeline == this.globalTimeline ){
            this.sidePanel.onresize = null;

            if ( this.globalTimeline.lastClipsSelected.length == 1 ){
                const clip = this.globalTimeline.lastClipsSelected[0][2];

                const p = new LX.Panel({id:"keyframeclip"});
                p.addTitle("Keyframe Clip");

                p.addText("Clip Name", clip.id, (v) =>{
                    clip.id = v;
                } )

                p.addColor("Clip Colour", clip.clipColor, (v,e) =>{
                    clip.clipColor = v;
                });

                p.addToggle("State", clip.active, (v,e) =>{
                    if ( !this.editor.getCurrentBoundAnimation().tracks[clip.trackIdx].active ){
                        p.widgets["State"].set(false, true);
                        return;
                    }
                    clip.active = v;
                    this.editor.globalAnimMixerManagementSingleClip(this.editor.currentCharacter.mixer, clip);
                    this.editor.setTime(this.editor.currentTime); // update mixer

                }, { className: "success", label: this.editor.getCurrentBoundAnimation().tracks[clip.trackIdx].active ? "" : "Track is disabled !" });                

                p.addButton(null, "Edit Keyframe Clip", (v,e)=>{
                    this.setKeyframeClip(clip);
                }, { buttonClass: "accent" });

                p.addBlank();

                p.branch("Clip Blending");

                p.addNumber( "Weight", clip.weight, (v,e) => { 
                    clip.weight = v; 
                    this.editor.computeKeyframeClipWeight(clip);
                    this.editor.setTime(this.editor.currentTime); // update visual skeleton pose
                }, {min: 0, max: 1, step: 0.001 });

                const fadetable = ["None","Linear","Quadratic","Sinusoid"]; 
                p.addSelect("Fade In Type", ["None", "Linear", "Quadratic", "Sinusoid"], fadetable[clip.fadeinType], (v,e) =>{
                    if ( clip.fadeinType == KeyframeEditor.FADETYPE_NONE ){
                        clip.fadein = clip.start + 0.25 * clip.duration;
                    }
                    clip.fadeinType = fadetable.indexOf(v);
                    this.editor.computeKeyframeClipWeight(clip);
                    if ( clip.fadeinType == KeyframeEditor.FADETYPE_NONE ){
                        delete clip.fadein;
                    }
                    this.editor.setTime(this.editor.currentTime); // update visual skeleton pose
                } );

                p.addSelect("Fade Out Type", ["None", "Linear", "Quadratic", "Sinusoid"], fadetable[clip.fadeoutType], (v,e) =>{
                    if ( clip.fadeoutType == KeyframeEditor.FADETYPE_NONE ){
                        clip.fadeout = clip.start + 0.75 * clip.duration;
                    }
                    clip.fadeoutType = fadetable.indexOf(v);
                    this.editor.computeKeyframeClipWeight(clip);
                    if ( clip.fadeoutType == KeyframeEditor.FADETYPE_NONE ){
                        delete clip.fadeout;
                    }
                    this.editor.setTime(this.editor.currentTime); // update visual skeleton pose
                } );


                p.addSelect("Blend Mode", ["Normal", "Additive" ], clip.blendMode == THREE.NormalAnimationBlendMode ? "Normal" : "Additive", (value, event) => {
                    let blendMode = value == "Normal" ? THREE.NormalAnimationBlendMode : THREE.AdditiveAnimationBlendMode;
                    if ( blendMode != clip.blendMode ){
                        this.globalTimeline.saveState(clip.trackIdx);
                        this.editor.setKeyframeClipBlendMode( clip, blendMode, true );
                        this.createSidePanel();
                    }
                });

                if ( clip.blendMode == THREE.AdditiveAnimationBlendMode ){
                    p.addButton(null, "Subtract first frame pose", null, { buttonClass: "error dashed" });
                    p.addButton(null, "Subtract bind pose", (v,e)=>{
                        this.globalTimeline.saveState(clip.trackIdx);
                        let skeleton = this.editor.currentCharacter.skeletonHelper.skeleton;
                        let skeletonclip = clip.skeletonAnimation;
                        skeleton.pose();

                        const groups = skeletonclip.tracksPerGroup;
                        for( let i = 0; i < skeleton.bones.length; ++i ){
                            const bone = skeleton.bones[i];
                            let tracks = groups[bone.name];
                            for( let t = 0; t < tracks.length; ++t ){
                                const values = tracks[t].values;

                                switch( tracks[t].id ){
                                    case "scale": 
                                        for(let v = 0; v < values.length; ){
                                            values[v] = values[v] - bone.scale.x; v++;
                                            values[v] = values[v] - bone.scale.y; v++;
                                            values[v] = values[v] - bone.scale.z; v++;
                                        }
                                    break;
                                    case "position": 
                                        for(let v = 0; v < values.length; ){
                                            values[v] = values[v] - bone.position.x; v++; 
                                            values[v] = values[v] - bone.position.y; v++;
                                            values[v] = values[v] - bone.position.z; v++;
                                        }
                                    break;
                                    case "quaternion": 
                                        let q = new THREE.Quaternion();
                                        for(let v = 0; v < values.length; v+= 4){
                                            q.fromArray(values, v);
                                            // localOffset = invBind * q = inv( invq * bind )
                                            q.invert().multiply(bone.quaternion).invert();
                                            values[v] = q.x;
                                            values[v+1] = q.y;
                                            values[v+2] = q.z;
                                            values[v+3] = q.w;
                                        }
                                    break;
                                }
                            }
                        }
                        this.editor.updateMixerAnimation( clip.mixerBodyAnimation, Object.keys(skeletonclip.tracks), skeletonclip );
                        this.editor.setTime(this.editor.currentTime);
                    }, { buttonClass: "error dashed" });

                }

                p.merge();


                tabsSide.attach(p);
            }
            return;
        }
        
        // SIDE PANEL FOR KEYFRAME CLIP

        //create tabs
        const tabs = this.bodyFaceTabs = tabsSide.addTabs({fit: true});

        const bodyArea = new LX.Area({id: 'Body'});  
        const faceArea = new LX.Area({id: 'Face'});  
        tabs.add( "Body", bodyArea, {selected: this.editor.animationMode == this.editor.animationModes.BODY, onSelect: (e,v) => {
            this.editor.setTimeline(this.editor.animationModes.BODY)
            this.propagationWindow.setTimeline( this.skeletonTimeline );
            this.canvasAreaOverlayButtons.buttons["Skeleton"].setState(true);
        }}  );
        
        
        tabs.add( "Face", faceArea, { selected: this.editor.animationMode != this.editor.animationModes.BODY, onSelect: (e,v) => {

            if(this.faceTabs.selected == this.editor.animationModes.FACEBS) {
                this.editor.setTimeline(this.editor.animationModes.FACEBS);
                this.propagationWindow.setTimeline( this.bsTimeline );
            }
            else { // if is in AU mode or is not defined
                this.imageMap.resize();
                this.editor.setTimeline(this.editor.animationModes.FACEAU);
                this.propagationWindow.setTimeline( this.auTimeline );
                this.selectActionUnitArea(this.editor.getSelectedActionUnit());
            }
            this.canvasAreaOverlayButtons.buttons["Skeleton"].setState(false);
            //  this.faceTabs.select("Action Units");
        }}  );

        const panel = faceArea.addPanel();
        // panel.root.style.maxHeight= "100vh";

        // Alex: This hacky offset corresponds to Title Widget inside the tabs.
        // Its height its not checked when computing final heights/scroll stuff (to fix in Lexgui)
        const titleOffset = 36;

        const auArea = new LX.Area({id: 'auFace', height: `calc(100% - ${ titleOffset }px)`});
        auArea.split({type: "vertical", sizes: ["auto", "auto"], resize: true});
        const [faceTop, faceBottom] = auArea.sections;

        const bsArea = new LX.Area({id: 'bsFace', height: `calc(100% - ${ titleOffset }px)`});

        this.faceTabs = panel.addTabSections("Edition Mode", [
            {
                name: "Action Units", icon: "ScanFace", selected: this.editor.animationMode == this.editor.animationModes.FACEAU,
                onCreate: p => {
                    p.addTitle("Action Units", { style: { background: "none", fontSize: "15px" } });
                    faceTop.root.style.minHeight = "20px";
                    faceTop.root.style.height = "auto";
                    faceBottom.root.style.minHeight = "20px";
                    faceBottom.root.style.height = "auto";
                    faceBottom.root.classList.add("overflow-y-auto");
                    this.createFacePanel( faceTop );
                    this.createActionUnitsPanel( faceBottom );
                    p.queuedContainer.appendChild(auArea.root);
                    if(this.imageMap) {
                        this.imageMap.resize();
                    }
                },
                onSelect: p => {
                    this.editor.setTimeline(this.editor.animationModes.FACEAU);
                    this.selectActionUnitArea(this.editor.getSelectedActionUnit());
                    
                    this.propagationWindow.setTimeline( this.auTimeline );
                    this.faceTabs.selected = this.editor.animationModes.FACEAU;
                    if(this.imageMap) {
                        this.imageMap.resize();
                    }                    
                }
            },
            {
                name: "Blendshapes", icon: "SlidersHorizontal", selected: this.editor.selected == this.editor.animationModes.FACEBS,
                onCreate: p => {
                    p.addTitle("Blendshapes", { style: { background: "none", fontSize: "15px" } });
                    this.createBlendshapesPanel( bsArea );
                    p.queuedContainer.appendChild(bsArea.root);
                },
                onSelect: p => {
                    this.editor.setTimeline(this.editor.animationModes.FACEBS); 
            
                    this.propagationWindow.setTimeline( this.bsTimeline );
                    this.faceTabs.selected = this.editor.animationModes.FACEBS;
                    //this.imageMap.resize();
                }
            }
        ], { vertical: true, height : "100%" });

        bodyArea.split({type: "vertical", resize: true, sizes: "auto"});
        const [bodyTop, bodyBottom] = bodyArea.sections;
        this.createSkeletonPanel( bodyTop, {firstBone: true, itemSelected: this.editor.selectedBone || this.editor.currentCharacter.skeletonHelper.bones[0].name} );
        this.createBonePanel( bodyBottom );
        
        this.sidePanel.onresize = (e)=>{
            if (faceTop.onresize){
                faceTop.onresize(e);
            }
        }
    }

    setBoneInfoState( enabled ) {

        if ( !this.editor.currentKeyFrameClip ){ 
            return;
        }

        const gizmoMode = this.editor.getGizmoMode();

        let w = this.bonePanel.get("Position");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Translate") }); }

        w = this.bonePanel.get("Rotation (XYZ)");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Rotate")}); }

        w = this.bonePanel.get("Scale");
        if ( w ){ w.root.getElementsByTagName("input").forEach((e)=> {e.disabled = (!enabled) | (gizmoMode != "Scale")}); }
    }

    // updates the necessary elements of the gui to adjust to the new animation
    onChangeAnimation( animation ){
        // this.skeletonTimeline.setAnimationClip( animation.skeletonAnimation, false );
        // this.auTimeline.setAnimationClip( animation.auAnimation, false );
        // this.bsTimeline.setAnimationClip( animation.bsAnimation, false);
        // this.bsTimeline.setSelectedItems(Object.keys(animation.bsAnimation.tracks));
        // this.updateAnimationPanel();
        // this.createActionUnitsPanel(); // need to update the panel's available blendshapes
        // this.createBlendshapesPanel( );
    }

    updateAnimationPanel( options = {}) {
        let panel = this.animationPanel;

        panel.onRefresh = (o) => {

            o = o || {};
            panel.clear();

            if (this.editor.currentKeyFrameClip){
                panel.addTitle( "Keyframe Clip" );
                const anim = this.editor.currentKeyFrameClip;
                panel.addText("Clip Name", anim.id, (v) =>{ 
                    anim.id = v;
                } )
                panel.addButton(null, LX.makeIcon("Undo2", { svgClass: "fg-white" }).innerHTML + "Return to global animation", (v,e)=>{
                    this.setKeyframeClip(null);
                }, { buttonClass: "error fg-white" });
            }
            else{
                panel.addTitle( "Animation" );
                const anim = this.globalTimeline.animationClip;
                panel.addText("Name", anim.id || "", (v) =>{ 
                    if ( v.length == 0 ){
                        this.animationPanel.widgets["Name"].set(this.editor.currentAnimation, true); // skipCallback
                        return;
                    }

                    if ( this.editor.currentAnimation == v ){
                        return;
                    }

                    let newName = this.editor.renameGlobalAnimation(this.editor.currentAnimation, v, true);
                    if ( newName != v ){
                        this.animationPanel.widgets["Name"].set(newName, true); // skipCallback
                        LX.toast("Animation Rename Issue", `\"${v}\" already exists. Renamed to \"${newName}\"`, { timeout: 7000 } );
                    }
                } );

            }

            panel.addSeparator();
        }
        panel.onRefresh(options);
    }

    createFacePanel(area) {
        this.imageMap = null;
        
        const padding = 16;
        const container = document.createElement("div");
        container.id = "faceAreasContainer";
        container.style.paddingTop = padding + "px";
        const colorShceme = document.documentElement.getAttribute("data-theme");
        container.style.filter = colorShceme == "dark" ? "" : "invert(1) saturate(1) hue-rotate(180deg)";
        container.style.height = "100%";
        container.style.width = "100%";
        container.style.alignItems = "center";

        const img = document.createElement("img");
        img.src = "./data/imgs/masks/face areas2.png";
        img.setAttribute("usemap", "#areasmap");
        img.style.position = "relative";
        container.appendChild(img);
        
        
        const map = this.auMap = document.createElement("map");
        map.name = "areasmap";

        const div = document.createElement("div");
        div.style.position = "fixed";
        const mapHovers = document.createElement("div");
        for(let facePart in this.faceAreas) {
            let maparea = document.createElement("area");
            maparea.title = this.faceAreas[facePart];
            maparea.shape = "poly";
            maparea.name = this.faceAreas[facePart];
            switch(this.faceAreas[facePart]) {
                case "Eye Left":
                    maparea.coords = "305,325,377,316,449,341,452,366,314,377,301,366";
                    break;
                    case "Eye Right":
                    maparea.coords = "76,347,145,317,212,318,225,327,228,366,212,379,92,375";
                    break;
                case "Mouth":
                    maparea.coords = "190,508,204,500,311,500,327,506,350,537,350,554,338,566,304,577,214,582,157,566,166,551,166,540"//"196,504,314,504,352,550,331,572,200,578,167,550";
                    break;
                case "Nose":
                    maparea.coords = "244,332,286,331,316,478,286,488,244,488,206,483";
                    break;
                case "Brow Left":
                    maparea.coords = "279,269,375,262,467,317,465,317,465,336,392,310,285,321";
                    break;
                case "Brow Right":
                    maparea.coords = "252,269,142,264,66,314,69,314,69,333,133,307,264,321";
                    break;
                case "Cheek Left":
                    maparea.coords = "305,384,378,388,441,380,461,389,463,409,436,507,390,582,357,532,333,499,321,451";
                    break;
                case "Cheek Right":
                    maparea.coords = "69,388,83,377,139,387,216,384,193,482,185,499,159,533,123,584,82,496";
                    break;
                case "Jaw":
                    maparea.coords = "155,569,184,583,258,592,342,579,364,567,377,597,311,666,259,681,205,671,132,610,130,595";
                    break;
            }
            maparea.src = "./data/imgs/masks/"+ maparea.name + " selected.png";
            map.appendChild(maparea);
            let imgHover = document.createElement("img");
            imgHover.src = "./data/imgs/masks/"+ maparea.name + " selected.png";
            imgHover.alt = maparea.name;
            imgHover.style.display = "none";
            imgHover.style.position = "relative";
            imgHover.style.height = "100%";
            mapHovers.appendChild(imgHover);
        }
        div.appendChild(mapHovers);
        mapHovers.style.position = "relative";
        container.appendChild(div);
        area.root.appendChild(container);
        container.appendChild(map);
        
        container.style.height = "100%";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        
        map.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectActionUnitArea(e.target.name);
            this.showTimeline();
            this.propagationWindow.updateCurve(true); // resize

            img.src = "./data/imgs/masks/face areas2 " + e.target.name + ".png";
            document.getElementsByClassName("map-container")[0].style.backgroundImage ="url('" +img.src +"')";

        });

        img.onload = (e) =>
        {
            let w = img.width;
            let h = img.height;
            img.style.height = "100%";
            if(!this.imageMap) {

                this.imageMap = new ImageMap(map, img, w, h);
            }
        }

        var ImageMap = function(map, img, w, h){
            var n,
                areas = map.getElementsByTagName('area'),
                len = areas.length,
                coords = [],
                aspectRatio = w / h,
                previousWidth = w,
                previousHeight = h;
            for (n = 0; n < len; n++) {
                coords[n] = areas[n].coords.split(',');
            }
            this.img = img;
            this.highlighter = new ImageMapHighlighter(img, {
                strokeColor: '67aae9',
                lineJoin: "round", 
                lineCap: "round"
            });
            
            this.highlighter.init();
            this.highlighter.element.parentElement.style.maxHeight = "500px";
            this.resize =  () => {
                var n, m, clen;
                let newHeight = Math.max( Math.min( area.root.clientWidth / aspectRatio, area.root.clientHeight ) - padding, 0.01 );
                let x = newHeight / previousHeight;
                for (n = 0; n < len; n++) {
                    clen = coords[n].length;
                    for (m = 0; m < clen; m++) {
                        coords[n][m] *= x;
                    }
                    areas[n].coords = coords[n].join(',');
                }
                previousWidth = newHeight * aspectRatio;
                previousHeight = newHeight;
                this.highlighter.element.parentElement.querySelector("canvas").width = previousWidth;
                this.highlighter.element.parentElement.querySelector("canvas").height = previousHeight;
                this.highlighter.element.parentElement.style.width = previousWidth + "px";
                this.highlighter.element.parentElement.style.height = previousHeight + "px";
                return true;
            };
            area.onresize = this.resize;
        }

    }

    createActionUnitsPanel( baseArea ) {
        // const baseArea = this.bodyFaceTabs.tabs.Face.sections[1]; // take bottom area of Face tab
        baseArea = baseArea || this.faceTabs.tabs["Action Units"].sections[1];
        // clear area before redoing all sliders
        while (baseArea.root.firstChild) {
            baseArea.root.removeChild(baseArea.root.lastChild);
        }
        baseArea.sections=[];

        // now start building the content
        
        const tabs = baseArea.addTabs({fit:true});
        const animation = this.auTimeline.animationClip;
        if ( !animation ){
            return;
        }
        
        const areas = this.editor.mapNames.parts;

        for(let area in areas) {

            const tabContainer = LX.makeContainer( [ "auto", "100%" ], "overflow-hidden flex flex-col" );

            LX.makeContainer( [ "100%", "auto" ], "flex justify-center py-2 text-lg", 
            area, 
            tabContainer, 
            { wordBreak: "break-word", lineHeight: "1.5rem" } );
            
            let panel = new LX.Panel({id: "au-"+ area});
            tabContainer.appendChild(panel.root);

            for(let id in areas[area]) {
                const name = areas[area][id];
                for(let i = 0; i < animation.tracks.length; i++) {
                    const track = animation.tracks[i];
                    if(track.groupId == area && track.id == name) {
                        let frame = this.auTimeline.getCurrentKeyFrame(track, this.auTimeline.currentTime, 0.1);
                        frame = frame == -1 ? 0 : frame;

                        panel.addNumber(name, track.values.length ? track.values[frame] : 0, (v,e) => {                           
                            this.editor.updateBlendshapesProperties(name, v, (tracksIds) => {
                                this.editor.updateBlendshapesAnimation(this.editor.currentKeyFrameClip.bsAnimation, tracksIds, this.auTimeline.animationClip);
                        });
                        }, {min: 0, max: 1, step: 0.01, signal: "@on_change_" + name, onPress: ()=>{ this.auTimeline.saveState(track.trackIdx) }});
                        break;
                    }
                }
            }
                        
            tabs.add(area, tabContainer, { selected: this.editor.getSelectedActionUnit() == area, onSelect : (e, v) => {
                    this.showTimeline();
                    this.editor.setSelectedActionUnit(v);
                    if(document.getElementsByClassName("map-container")[0]) {
                        document.getElementsByClassName("map-container")[0].style.backgroundImage ="url('" +"./data/imgs/masks/face areas2 " + v + ".png"+"')";
                    }
                    this.propagationWindow.updateCurve(true); // resize
                }
            });
        }

        tabs.root.classList.add("hidden"); // hide tab titles only
        this.facePanel = tabs;

    }

    selectActionUnitArea( area ) {
        if(!this.facePanel ) {
            return;
        }
        this.facePanel.select(area);
    }

    createBlendshapesPanel( area ) {

        area = area || this.faceTabs.tabs["Blendshapes"];
        area.root.innerHTML = "";

        const animation = this.bsTimeline.animationClip;
        if ( !animation ){
            return;
        }

        let panel = new LX.Panel({id: "bs-"+ area});

        for(let i = 0; i < animation.tracks.length; i++) {
            const track = animation.tracks[i];

            const name = track.id;
            let frame = this.bsTimeline.getCurrentKeyFrame(track, this.bsTimeline.currentTime, 0.1);
            frame = frame == -1 ? 0 : frame;
            if( (!this.bsTimeline.lastKeyFramesSelected.length || this.bsTimeline.lastKeyFramesSelected[0][2] != frame)) {
                this.bsTimeline.selectKeyFrame(track.trackIdx, frame);
            }

            panel.addNumber(name, track.values[frame], (v,e) => {    
                const boundAnimation = this.editor.currentKeyFrameClip;
                // let frame = this.bsTimeline.getCurrentKeyFrame(track, this.bsTimeline.currentTime, 0.1);
                //     frame = frame == -1 ? 0 : frame;
                // for(let id in track.data.tracksIds ) {
                //     const idx = track.data.tracksIds[id];
                //     boundAnimation.bsAnimation.tracks[idx][frame] = v;
                // }
                this.editor.updateBlendshapesProperties(name, v, (tracksIds) => {
                    this.editor.updateMixerAnimation(boundAnimation.mixerFaceAnimation, tracksIds);
                    this.editor.updateActionUnitsAnimation(this.auTimeline.animationClip, tracksIds);
                });
                
            }, {nameWidth: "40%", min: 0, max: 1, step: 0.01, signal: "@on_change_" + name, onPress: () => {
                this.bsTimeline.saveState(track.trackIdx)
             }});
        }
        
        area.attach(panel);
    }

    createSkeletonPanel(root, options) {

        let skeletonPanel = new LX.Panel({id:"skeleton"});
        root.attach(skeletonPanel);

        options = options || {};
        this.boneProperties = {};
        this.editor.selectedBone = options.itemSelected ?? this.editor.selectedBone;
        
        const mytree = this.updateNodeTree();
    
        this.treeWidget = skeletonPanel.addTree("Skeleton bones", mytree, { 
            // icons: tree_icons, 
            filter: true,
            rename: false,
            onevent: (event) => { 
                console.log(event.string());
    
                switch(event.type) {
                    case LX.TreeEvent.NODE_SELECTED: 
                        if(event.multiple)
                            console.log("Selected: ", event.node); 
                        else {
                            if(!this.editor){
                                throw("No editor attached");
                            }
                            
                            const itemSelected = event.node.id;
                            if ( itemSelected != this.editor.selectedBone ){
                                this.editor.setSelectedBone( itemSelected );
                            }
                            this.showTimeline();
                            console.log(itemSelected + " selected"); 
                        }
                        break;
                    case LX.TreeEvent.NODE_DBLCLICKED: 
                        console.log(event.node.id + " dbl clicked"); 
                        break;
                    case LX.TreeEvent.NODE_CONTEXTMENU: 
                        console.log(event.node.id + " context menu");
                        break;
                    case LX.TreeEvent.NODE_DRAGGED: 
                        console.log(event.node.id + " is now child of " + event.value.id); 
                        break;
                    case LX.TreeEvent.NODE_RENAMED:
                        console.log(event.node.id + " is now called " + event.value); 
                        break;
                    case LX.TreeEvent.NODE_VISIBILITY:
                        const tracksInItem = this.skeletonTimeline.animationClip.tracksPerGroup[event.node.id];
                        for( let i = 0; i < tracksInItem.length; ++i ){
                            this.skeletonTimeline.setTrackState(tracksInItem[i].trackIdx, event.value);
                        }
                        console.log(event.node.id + " visibility: " + event.value); 
                        break;
                }
            },
        });
    }

    updateNodeTree() {
        
        const rootBone = this.editor.currentCharacter.skeletonHelper.bones[0];
        
        let mytree = { 
            id: rootBone.name, 
            // selected: rootBone.name == this.editor.boneSelected 
        };
        let children = [];
        
        const addChildren = (bone, array) => {
            
            for( let b of bone.children ) {
                
                if ( ! b.isBone ){ continue; }
                let child = {
                    id: b.name,
                    children: [],
                    closed: true,
                    // selected: b.name == this.editor.boneSelected
                }
                
                array.push( child );
                
                addChildren(b, child.children);
            }
        };
        
        addChildren(rootBone, children);
        
        mytree['children'] = children;
        return mytree;
    }

    createBonePanel(root, options = {}) {

        let bonePanel = new LX.Panel({id:"bone"});
        root.attach(bonePanel);
        // Editor widgets 
        this.bonePanel = bonePanel;
        options.itemSelected = options.itemSelected ?? this.editor.selectedBone;
        this.updateSkeletonPanel();

    }

    updateSkeletonPanel() {

        if ( !this.bonePanel ){ 
            return;
        }

        let widgets = this.bonePanel;

        widgets.onRefresh = () => {
            widgets.clear();

            const boneSelected = this.editor.currentCharacter.skeletonHelper.bones[this.editor.gizmo.selectedBone];
            const animationClip = this.skeletonTimeline.animationClip;
            if(boneSelected && animationClip ) {

                const tracks = this.skeletonTimeline.getTracksGroup(boneSelected.name); 
                if ( !tracks || !tracks.length ){
                    return;
                }
                const numTracks = tracks.length;

                let trackType = this.editor.getGizmoMode();

                let active = this.editor.getGizmoMode();

                const toolsValues = [ 
                    { value: "Joint", selected: this.editor.getGizmoTool() == "Joint", callback: (v,e) => {this.editor.setGizmoTool(v); widgets.onRefresh();} },
                    { value: "Follow", selected: this.editor.getGizmoTool() == "Follow", callback: (v,e) => {this.editor.setGizmoTool(v); widgets.onRefresh();} 
                }];
                const _Tools = this.editor.hasGizmoSelectedBoneIk() ? toolsValues : [toolsValues[0]];
                
                widgets.branch("Gizmo", { icon:"Axis3DArrows", settings: (e) => this.openSettings( 'gizmo' ) });
                
                widgets.addComboButtons( "Tool", _Tools, { });
                
                if( this.editor.getGizmoTool() == "Joint" ){
                    
                    let _Modes = [];
                    
                    for(let i = 0; i < tracks.length; i++) {
                        if(this.skeletonTimeline.lastKeyFramesSelected.length && this.skeletonTimeline.lastKeyFramesSelected[0][0] == tracks[i].trackIdx) {
                            trackType = tracks[i].id;                            
                        }

                        if(tracks[i].id == "position") {
                            const mode = {
                                value: "Translate", 
                                selected: this.editor.getGizmoMode() == "Translate",
                                callback: (v,e) => {
                                
                                    const frame = this.skeletonTimeline.getCurrentKeyFrame(tracks[i], this.skeletonTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.skeletonTimeline.unSelectAllKeyFrames();
                                        this.skeletonTimeline.selectKeyFrame(tracks[i].trackIdx, frame, true);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }
                        else if(tracks[i].id == "quaternion" ){ 
                            const mode = {
                                value: "Rotate",
                                selected: this.editor.getGizmoMode() == "Rotate",
                                callback: (v,e) => {
                                
                                    const frame = this.skeletonTimeline.getCurrentKeyFrame(tracks[i].trackIdx, this.skeletonTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.skeletonTimeline.unSelectAllKeyFrames();
                                        this.skeletonTimeline.selectKeyFrame(tracks[i].trackIdx, frame, true);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }
                        else if(tracks[i].id == "scale") {
                            const mode = {
                                value: "Scale",
                                selected: this.editor.getGizmoMode() == "Scale",
                                callback: (v,e) => {
                                
                                    const frame = this.skeletonTimeline.getCurrentKeyFrame(tracks[i], this.skeletonTimeline.currentTime, 0.01); 
                                    if( frame > -1 ) {
                                        this.skeletonTimeline.unSelectAllKeyFrames();
                                        this.skeletonTimeline.selectKeyFrame(tracks[i].trackIdx, frame, true);
                                    }
                                    this.editor.setGizmoMode(v); 
                                    widgets.onRefresh();
                                }
                            }
                            _Modes.push(mode);
                        }                        
                    }

                    if(trackType == "position") {
                        this.editor.setGizmoMode("Translate");
                    }
                    else if(trackType == "quaternion" || numTracks <= 1 ){ 
                        this.editor.setGizmoMode("Rotate"); 
                    }
                    else if(trackType == "scale") {
                        this.editor.setGizmoMode("Scale");
                    }
                    widgets.addComboButtons( "Mode", _Modes, { });

                    const _Spaces = [
                        { value: "Local", selected: this.editor.getGizmoSpace() == "Local", callback: v =>  this.editor.setGizmoSpace(v)},
                        { value: "World", selected: this.editor.getGizmoSpace() == "World", callback: v =>  this.editor.setGizmoSpace(v)}
                    ]
                    widgets.addComboButtons( "Space", _Spaces, { });
                }

                if ( this.editor.getGizmoTool() == "Follow" ){
                     // if inhere, it means it has at least one ik mode available
                    let modesValues = [];
                    let current = this.editor.getGizmoIkMode();
                    if ( this.editor.hasGizmoSelectedBoneIk( Gizmo.ToolIkModes.LARGECHAIN ) ){
                        modesValues.push( {value:"Multiple", selected: current == "Multiple", callback: (v,e) => {this.editor.setGizmoIkMode(v); widgets.onRefresh();} } );
                    } else { // default
                        current = "Single";
                    }

                    if ( this.editor.hasGizmoSelectedBoneIk( Gizmo.ToolIkModes.ONEBONE ) ){
                        modesValues.push( {value:"Single", selected: current == "Single", callback: (v,e) => {this.editor.setGizmoIkMode(v); widgets.onRefresh();} } );
                    }

                    widgets.addComboButtons( "Mode", modesValues, { });
                    this.editor.setGizmoIkMode( current );
                }
                
                widgets.addCheckbox( "Snap", this.editor.isGizmoSnapActive(), () => this.editor.toggleGizmoSnap() );

                widgets.addSeparator();
                

                const innerUpdate = (attribute, value) => {
            
                    if(attribute == 'quaternion') {
                        boneSelected.quaternion.fromArray( value ).normalize(); 
                        let rot = boneSelected.rotation.toArray().slice(0,3); // radians
                        widgets.widgets['Rotation (XYZ)'].set( rot, true ); // skip onchange event
                    }
                    else if(attribute == 'rotation') {
                        boneSelected.rotation.set( value[0] * UTILS.deg2rad, value[1] * UTILS.deg2rad, value[2] * UTILS.deg2rad ); 
                        widgets.widgets['Quaternion'].set(boneSelected.quaternion.toArray(), true ); // skip onchange event
                    }
                    else if(attribute == 'position') {
                        boneSelected.position.fromArray( value );
                    }

                    this.editor.gizmo.onGUI(attribute);
                };


                widgets.branch("Bone", { icon: "Bone" });
                widgets.addText("Name", boneSelected.name, null, {disabled: true});
                widgets.addText("Num tracks", numTracks ?? 0, null, {disabled: true});

                // Only edit position for root bone
                if(boneSelected.children.length && boneSelected.parent.constructor !== boneSelected.children[0].constructor) {
                    this.boneProperties['position'] = boneSelected.position;
                    widgets.addVector3('Position', boneSelected.position.toArray(), (v) => innerUpdate("position", v), {disabled: this.editor.state || active != 'Translate', precision: 3, step: 0.01, className: 'bone-position'});

                    this.boneProperties['scale'] = boneSelected.scale;
                    widgets.addVector3('Scale', boneSelected.scale.toArray(), (v) => innerUpdate("scale", v), {disabled: this.editor.state || active != 'Scale', precision: 3, className: 'bone-scale'});
                }

                this.boneProperties['rotation'] = boneSelected.rotation;
                let rot = boneSelected.rotation.toArray().slice(0,3); // toArray returns [x,y,z,order]
                rot[0] = rot[0] * UTILS.rad2deg; rot[1] = rot[1] * UTILS.rad2deg; rot[2] = rot[2] * UTILS.rad2deg;
                widgets.addVector3('Rotation (XYZ)', rot, (v) => {innerUpdate("rotation", v)}, {step:1, disabled: this.editor.state || active != 'Rotate', precision: 3, className: 'bone-euler'});

                this.boneProperties['quaternion'] = boneSelected.quaternion;
                widgets.addVector4('Quaternion', boneSelected.quaternion.toArray(), (v) => {innerUpdate("quaternion", v)}, {step:0.01, disabled: true, precision: 3, className: 'bone-quaternion'});
            }

        };

        widgets.onRefresh();
    }
    /** ------------------------------------------------------------ */

    createAvailableAnimationsTable(){

        const animations = this.editor.boundAnimations;
        const characterName = this.editor.currentCharacter.name;
        let availableAnimations = [];
        for ( let aName in animations ){
            if ( !animations[aName][characterName] ){
                continue;
            }
            let numClips = 0;
            animations[aName][characterName].tracks.forEach((v,i,arr) =>{ numClips += v.clips.length } );
            availableAnimations.push([ aName, numClips, animations[aName][characterName].duration.toFixed(3) ]);
        }

        let table = new LX.Table(null, {
                head: ["Name",  "Num. Clips", "Duration (s)"],
                body: availableAnimations
            },
            {
                selectable: true,
                sortable: true,
                toggleColumns: true,
                filter: "Name",
                // TODO add a row icon to modify the animations name
            }
        );
        return table;
    }

    createSaveDialog() {
        this.showExportAnimationsDialog( "Save animations in server", ( info ) => {

            const saveDataToServer = (location,) => {
                const animations = this.editor.export(info.selectedAnimations, info.format, false);
                for( let i = 0; i < animations.length; i++ ) {
                    
                    this.editor.uploadData( animations[i].name, animations[i].data, "clips", location, () => {
                        this.closeDialogs();
                        LX.popup('"' + animations[i].name + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                    })
                }
            }

            const session = this.editor.remoteFileSystem.session;
            const user = session ? session.user : "";
            
            if(!user || user.username == "guest") {
                this.prompt = new LX.Dialog("Alert", d => {
                    d.addTextArea(null, "The animation will be saved locally. You must be logged in to save it into server.", null, {disabled:true, className: "nobg"});
                    const btn = d.addButton(null, "Login", () => {
                        this.prompt.close();
                        this.showLoginModal();
                    }, {width:"50%", buttonClass:"accent"});
                    btn.root.style.margin = "0 auto";
                }, {closable: true, modal: true})
                
            }
            else {
                saveDataToServer("server");
            }
        }, {formats: [ "BVH", "BVH extended"], selectedFormat: "BVH extended"});
    }

    createServerClipsDialog() {
        
        const session = this.editor.remoteFileSystem.session;
        const username = session ? session.user.username : "guest";
        let repository = this.editor.remoteFileSystem.repository;

        if( this.prompt && this.prompt.root.checkVisibility() ) {
            return;
        }
        
        // Create a new dialog
        const dialog = this.prompt = new LX.Dialog('Available clips', async (p) => {
            
            const innerSelect = async (asset, button, e, action) => {                
                const choice = document.getElementById("choice-insert-mode");
                if( choice ) {
                    choice.remove();
                }
                
                if( !asset.animation ) {
                    dialog.close();
                    this.closeDialogs();
                    LX.popup("The file is empty or has an incorrect format.", "Ops! Animation Load Issue!", {timeout: 9000, position: [ "10px", "50px"] });

                    return;
                }

                asset.animation.name = asset.id;

                dialog.panel.loadingArea.show();
                this.editor.loadAnimation( asset.id, asset.animation );
                dialog.panel.loadingArea.hide();
    
                assetViewer.clear();
                dialog.close();
            }

            const previewActions = [
                {
                    type: "bvh",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bvh",
                    name: 'Add as a clip', 
                    callback: innerSelect
                },
                {
                    type: "bvhe",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bvhe",
                    name: 'Add as a clip', 
                    callback: innerSelect
                },             
                {
                    type: "glb",
                    name: 'Add as a clip', 
                    callback: innerSelect
                },             
                {
                    type: "gltf",
                    name: 'Add as a clip', 
                    callback: innerSelect
                },             
            ];

            if( username != "guest" ) {
                previewActions.push(
                {
                    type: "bvh",
                    path: "@/Local/clips",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.uploadData(item.filename, item.data, "clips", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/Local/clips",
                    name: 'Upload to server', 
                    callback: (item)=> {
                        this.editor.uploadData(item.filename, item.data, "clips", "server", () => {
                            this.closeDialogs();
                            LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvh",
                    path: "@/Local/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        const i = this.editor.localStorage[0].children[0].children.indexOf(item);
                        const items = this.editor.localStorage[0].children[0].children;
                        this.editor.localStorage[0].children[0].children = items.slice(0, i).concat(items.slice(i+1));  
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/Local/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        const i = this.editor.localStorage[0].children[0].children.indexOf(item);
                        const items = this.editor.localStorage[0].children[0].children;
                        this.editor.localStorage[0].children[0].children = items.slice(0, i).concat(items.slice(i+1));                        
                    }
                });             
                previewActions.push({
                    type: "bvh",
                    path: "@/"+ username + "/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                            if(v) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                item.folder.children = v;
                                assetViewer._deleteItem(item);
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            // this.closeDialogs();                            
                        });
                    }
                });
                previewActions.push({
                    type: "bvhe",
                    path: "@/"+ username + "/clips",
                    name: 'Delete', 
                    callback: ( item )=> {
                        this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                            if(v) {
                                LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                item.folder.children = v;
                                assetViewer._deleteItem(item);
                            }
                            else {
                                LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});

                            }
                            // this.closeDialogs();                            
                        });
                    }
                });            
            }
            
            const assetViewer = new LX.AssetView({  allowedTypes: ["bvh", "bvhe", "glb", "gltf"],  previewActions: previewActions, contextMenu: false});
            p.attach( assetViewer );
            
            const loadingArea = p.loadingArea = this.createLoadingArea(p);

            if( !repository.length ) {
                await this.editor.remoteFileSystem.loadAllUnitsFolders(() => {
                    let repository = this.editor.remoteFileSystem.repository;
                    this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                    loadingArea.hide();
                }, ["clips"]);
            }            
            else {
                this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                loadingArea.hide();
            }
       
        }, { title:'Clips', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: false,  modal: true,
    
            onclose: ( root ) => {

                if( modal.destroy ) {
                    modal.destroy();
                }
                root.remove();

                this.prompt = null;
                if( !LX.modal.hidden ) {
                    LX.modal.toggle(true);
                }
                if( this.choice ) {
                    this.choice.close();
                }
            }
        });
    }

    loadAssets( assetViewer, repository, onSelectFile ) {
        assetViewer.load( repository, async e => {
            switch(e.type) {
                case LX.AssetViewEvent.ASSET_SELECTED:
                    if(e.item.type == "folder") {
                        return;
                    }                      
                    if(!e.item.animation) {
                        const promise = new Promise((resolve) => {
                            this.editor.fileToAnimation(e.item, ( file ) => {
                                if( file ) {
                                    resolve(file);
                                }
                                else {
                                    resolve( null );
                                }
                            });
                        })
                        const parsedFile = await promise;
                        e.item.animation = parsedFile.animation;
                        e.item.content = parsedFile.content;
                    }
                    break;
                case LX.AssetViewEvent.ASSET_DELETED: 
                    console.log(e.item.id + " deleted"); 
                    break;
                case LX.AssetViewEvent.ASSET_CLONED: 
                    console.log(e.item.id + " cloned"); 
                    break;
                case LX.AssetViewEvent.ASSET_RENAMED:
                    console.log(e.item.id + " is now called " + e.value); 
                    break;
                case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                    if(e.item.type != "folder") {
                        if( !e.item.animation ) {
                            const promise = new Promise((resolve) => {
                                this.editor.fileToAnimation(e.item, (file) => {
                                    if( file ) {
                                        resolve(file);
                                    }
                                    else {
                                        resolve( null );
                                    }
                                });
                            })
                            const parsedFile = await promise;
                            e.item.animation = parsedFile.animation;
                            e.item.content = parsedFile.content;
                        }

                        this.closeDialogs(); 
                        onSelectFile(e.item);
                    }
                    break;

                case LX.AssetViewEvent.ENTER_FOLDER:
                    if( e.item.unit && !e.item.children.length ) {
                        assetViewer.parent.loadingArea.show();

                        this.editor.remoteFileSystem.getFiles(e.item.unit, e.item.fullpath, (files, resp) => {
                            const files_data = [];
                            if( files ) {                                        
                                for( let f = 0; f < files.length; f++ ) {
                                    files[f].id = files[f].filename;
                                    files[f].folder = e.item;
                                    files[f].type = UTILS.getExtension(files[f].filename);
                                    files[f].lastModified = files[f].timestamp;
                                    if(files[f].type == "txt")
                                        continue;
                                    files_data.push(files[f]);
                                }
                                e.item.children = files_data;
                            }
                            assetViewer.currentData = files_data;
                            assetViewer._updatePath(assetViewer.currentData);

                            if( !assetViewer.skipBrowser ) {
                                assetViewer._createTreePanel();
                            }

                            assetViewer._refreshContent();

                            assetViewer.parent.loadingArea.hide();
                        });
                    }                
                    break;
            }
        })
    }

    showSourceCode( asset ) {
        if( window.dialog ) {
            window.dialog.destroy();
        }
    
        window.dialog = new LX.PocketDialog("Editor", p => {
            const area = new LX.Area();
            p.attach( area );

            const filename = asset.filename;
            const type = asset.type;
            const name = filename.replace("."+ type, "");
                        
            const codeEditor = new LX.CodeEditor(area, {
                allow_add_scripts: false,
                name: type,
                title: name,
                disable_edition: true
            });
            
            codeEditor.setText( asset.content );
            
            codeEditor._changeLanguage( "JSON" );
                     
        }, { size: ["40%", "600px"], closable: true });
    }

    setSkeletonVisibility( visibility ){

    }

    createSceneUI(area) {

        let editor = this.editor;
        let canvasButtons = []
        
        if(editor.scene.getObjectByName("Armature")) {
            canvasButtons = [
                {
                    name: 'Skin',
                    property: 'showSkin',
                    icon: 'UserX',
                    selectable: true,
                    callback: (v) =>  {
                        editor.showSkin = !editor.showSkin;
                        let model = editor.scene.getObjectByName("Armature");
                        model.visible = editor.showSkin;
                        
                    }
                },        
                {
                    name: 'Skeleton',
                    property: 'showSkeleton',
                    icon: 'Bone',
                    selectable: true,
                    selected: false,
                    callback: (value,event) =>  {
                        editor.showSkeleton = this.canvasAreaOverlayButtons.buttons["Skeleton"].root.children[0].classList.contains("selected");
                        let skeleton = editor.scene.getObjectByName("SkeletonHelper");
                        skeleton.visible = editor.showSkeleton;
                        editor.scene.getObjectByName('GizmoPoints').visible = editor.showSkeleton;
                        if(!editor.showSkeleton) 
                            editor.gizmo.stop();
                    }
                }
            ];       
        }
        
        canvasButtons.push(
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'Grid',
                selectable: true,
                selected: true,
                callback: (v, e) => {
                    editor.showGUI = !editor.showGUI;

                    if( editor.scene.getObjectByName('Armature') ) {
                        editor.scene.getObjectByName('SkeletonHelper').visible = editor.showGUI;
                    }

                    if( editor.gizmo ) {
                        editor.scene.getObjectByName('GizmoPoints').visible = editor.showGUI;
                    }

                    editor.scene.getObjectByName('Grid').visible = editor.showGUI;
                    
                    if(!editor.showGUI) {
                        if(editor.gizmo) {
                            editor.gizmo.stop();
                        }
                        this.hideTimeline();
                        this.sidePanel.parentArea.extend();
                        this.hideVideoOverlay();                       
                    } else {
                        this.showTimeline();
                        this.sidePanel.parentArea.reduce();  
                        const currentAnim = this.editor.currentKeyFrameClip;
                        if ( currentAnim && currentAnim.type == "video" && this.showVideo ){
                            this.showVideoOverlay();
                        }
                    }                  
                }
            }
        )
        
        this.canvasAreaOverlayButtons = area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }
}

const ClipModes = { Phrase: 0, Glosses: 1, Actions: 2, Keyframes: 3};
class ScriptGui extends Gui {

    constructor(editor) {
        
        super(editor);
        
        this.mode = ClipModes.Actions;
        this.delayedUpdateID = null; // onMoveContent and onUpdateTracks. Avoid updating after every single change, which makes the app unresponsive
        this.delayedUpdateTime = 500; //ms
    }

    onCreateMenuBar( entries ) {
        
        const projectMenu = entries.find( e => e.name == "Project" )?.submenu;
        console.assert(projectMenu, "Project menu not found" );

        projectMenu.push(
            {
                name: "New Animation",
                icon: "Plus",
                callback: () => {
                    let count = 1;
                    let countName = "new animation";
                    while( this.editor.loadedAnimations[countName] ){
                        countName = `new animation (${count++})`; 
                    }
                    this.editor.loadAnimation(countName, {});
                    this.updateAnimationPanel();
                }
            },
            null,
            {
                name: "Import Animations",
                icon: "FileInput",
                submenu: [
                    { name: "From Disk", icon: "FileInput", callback: () => this.importFiles(), kbd: "CTRL+O" },
                    { name: "From Database", icon: "Database", callback: () => this.createServerClipsDialog(), kbd: "CTRL+I" }
                ]
            },
            null,
            // Export (download) animation
            {
                name: "Export animations", icon: "Download", kbd: "CTRL+E", callback: () => {
                    this.showExportAnimationsDialog("Export animations", ( info ) => this.editor.export( info.selectedAnimations, info.format ), {formats: ["BML", "BVH", "BVH extended", "GLB"]});
                }
            },
            // Save animation in server
            { name: "Save animation", icon: "Save", kbd: "CTRL+S", callback: () => this.createSaveDialog() },
            { name: "Preview in PERFORMS", icon: "StreetView", callback: () => this.editor.showPreview() },
        );

        const timelineMenu = entries.find( e => e.name == "Timeline" )?.submenu;
        console.assert(timelineMenu, "Timeline menu not found" );
        timelineMenu.push(
            { name: "Reorder Clips", icon: "Magnet", submenu: [
                { name: "Type", icon:"Star", callback: () => this.reorderClips(0) },
                { name: "Type and Handedness", icon: "StarHalf", callback: () => this.reorderClips(1) },
            ] }
        );

        const shortcutsMenu = timelineMenu.find( e => e.name == "Shortcuts" )?.submenu;
        console.assert(shortcutsMenu, "Shortcuts menu not found" );

        shortcutsMenu.push(
            null,
            { name: "Add Behaviour", kbd: "CTRL+B" },
            "Clips",
            { name: "Move", kbd: "Hold CTRL" },
            { name: "Add", kbd: "Right Click" },
            { name: "Copy", kbd: "CTRL+C" },
            { name: "Copy", kbd: "Right Click" },
            { name: "Paste", kbd: "CTRL+V" },
            { name: "Paste", kbd: "Right Click" },
            null,
            { name: "Delete Single", kbd: "DEL" },
            { name: "Delete Multiple", kbd: "Hold LSHIFT + DEL" },
            null,
            { name: "Select Single", kbd: "Left Click" },
            { name: "Select Multiple", kbd: "Hold LSHIFT" },
            { name: "Select Box", kbd: "Hold LSHIFT+Drag" }
        );

        const aboutMenu = entries.find( e => e.name == "About" )?.submenu;
        console.assert(aboutMenu, "About menu not found" );
        aboutMenu.push(
            { name: "Documentation", icon: "BookOpen", callback: () => window.open("https://animics.gti.upf.edu/docs/script_animation.html", "_blank")},
            { name: "BML Instructions", icon: "CodeSquare", callback: () => window.open("https://github.com/upf-gti/performs/blob/main/docs/InstructionsBML.md", "_blank") },
            { name: "Github", icon: "Github", callback: () => window.open("https://github.com/upf-gti/animics", "_blank")}                                
        );
        

    }

    delayedUpdateTracks( reset = true ){
        if ( this.delayedUpdateID && reset ){ clearTimeout(this.delayedUpdateID); this.delayedUpdateID = null; }
        if ( !this.delayedUpdateID ){
            this.delayedUpdateID = setTimeout( ()=>{ this.delayedUpdateID = null; this.editor.updateTracks(); }, this.delayedUpdateTime );
        }
    }

    /** Create timelines */
    createTimelines( ) {
                               
        this.clipsTimeline = new LX.ClipsTimeline("clipsTimelineId", {
            title: "Behaviour actions",
            onCreateBeforeTopBar: (panel) => {
                // panel.addButton
                panel.addSelect("Animation", Object.keys(this.editor.loadedAnimations), this.editor.currentAnimation, (v)=> {
                    this.editor.setGlobalAnimation(v); // already updates gui
                }, {signal: "@on_animation_loaded", id:"animation-selector", nameWidth: "auto"})
                
            },
            onCreateAfterTopBar: (panel) =>{
                panel.addNumber("Speed", + this.editor.playbackRate.toFixed(3), (value, event) => {
                    this.editor.setPlaybackRate(value);
                }, {
                    step: 0.01,
                    signal: "@on_set_speed",
                    nameWidth: "auto"
                });
            },
            onCreateSettingsButtons: (panel) => {
                panel.addButton("", "clearTracks", (value, event) =>  {
                    this.editor.clearAllTracks();     
                    this.updateAnimationPanel();
                }, {icon: 'Trash2', tooltip: true, title: "Clear Tracks"});
                
            },
            onShowConfiguration: (dialog) => {
                dialog.addNumber("Framerate", this.editor.animationFrameRate, (v) => {
                    this.editor.animationFrameRate = v;
                }, {min: 0, disabled: false});
                dialog.addNumber("Num tracks", this.clipsTimeline.animationClip ? this.clipsTimeline.animationClip.tracks.length : 0, null, {disabled: true});
            },
        });

        this.clipsTimeline.onAddNewTrack = (track, initData) =>{ track.id = "Track " + (this.clipsTimeline.animationClip.tracks.length-1);}

        this.clipsTimeline.leftPanel.parent.root.style.zIndex = 1;
        this.clipsTimeline.onChangeLoopMode = (loop) => {
                this.updateLoopModeGui( loop );
        };
        this.clipsTimeline.onSetTime = (t) => this.editor.setTime(t, true);
        this.clipsTimeline.onSetDuration = (t) => { 
            const currentBound = this.editor.getCurrentBoundAnimation();
            if (!currentBound){ return; }
            currentBound.mixerAnimation.duration = t;
        };
       
        this.clipsTimeline.onStateChange = (state) => {
            if(state != this.editor.state) {
                this.menubar.getButton("Play").swap(); // click();
            }
        }
        this.clipsTimeline.onStateStop = () => {
            this.menubar.getButton("Stop").setState(true); // click();
        }
        this.clipsTimeline.onSelectClip = this.updateClipPanel.bind(this);

        this.clipsTimeline.onContentMoved = (clip, offset)=> {
            if(clip.strokeStart) clip.strokeStart+=offset;
            if(clip.stroke) clip.stroke+=offset;
            if(clip.strokeEnd) clip.strokeEnd+=offset;
            this.updateClipSyncGUI();
            if(clip.onChangeStart)  {
                clip.onChangeStart(offset);
            }

            this.delayedUpdateTracks();
        };

        this.clipsTimeline.onDeleteSelectedClips = (selectedContent) => {
            this.editor.updateTracks();
            this.updateClipPanel();
        }

        this.clipsTimeline.cloneClips = (clipsToClone, timeOffset) => {
            let clipsToReturn = [];
            for(let i = 0; i < clipsToClone.length; i++){
                let clip = clipsToClone[i];
                clip.end = null;
                if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                if(clip.ready!=undefined) clip.ready = clip.fadein;
                if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                if(clip.relax!=undefined) clip.relax = clip.fadeout;
                if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                
                let newClip = new ANIM[clip.constructor.name](clip);
                newClip.start += timeOffset;
                newClip.fadein += timeOffset; 
                newClip.fadeout += timeOffset; 
                if(newClip.attackPeak) newClip.fadein = newClip.attackPeak += timeOffset;
                if(newClip.relax) newClip.fadeout = newClip.relax += timeOffset;
                if(newClip.ready) newClip.fadein = newClip.ready += timeOffset;
                if(newClip.strokeStart) newClip.strokeStart += timeOffset;
                if(newClip.stroke) newClip.stroke += timeOffset;
                if(newClip.strokeEnd) newClip.strokeEnd += timeOffset;
                
                clipsToReturn.push(newClip); 
            }
            return clipsToReturn;
        }

        this.clipsTimeline.showContextMenu = ( e ) => {

            e.preventDefault();
            e.stopPropagation();

            let actions = [];
            if(this.clipsTimeline.lastClipsSelected.length) {
                actions.push(
                    {
                        title: "Copy",
                        callback: () => this.clipsTimeline.copySelectedContent()
                    }
                );
                actions.push(
                    {
                        title: "Delete",
                        callback: () => this.clipsTimeline.deleteSelectedContent()
                    }
                );
                actions.push(
                    {
                        title: "Create preset",
                        callback: () => {
                            this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                                if(a[0]<b[0]) 
                                    return -1;
                                return 1;
                            });
                            this.createSaveDialog( "presets");
                            // this.createNewPresetDialog(this.clipsTimeline.lastClipsSelected);
                        }
                    }
                );
                if(this.clipsTimeline.lastClipsSelected.length == 1 && e.track.trackIdx == this.clipsTimeline.lastClipsSelected[0][0]) {
                    let clip = e.track.clips[this.clipsTimeline.lastClipsSelected[0][1]];
                    if(clip.type == "glossa") {                        
                        actions.push(
                            {
                                title: "Break down into actions",
                                callback: () => {
                                    this.clipsTimeline.deleteSelectedContent(true); // skip callback
                                    this.mode = ClipModes.Actions;
                                    this.clipsTimeline.addClips(clip.clips, this.clipsTimeline.currentTime);
                                }
                            }
                        );
                    }
                }
                actions.push(
                    {
                        title: "Create sign",
                        callback: () => {
                            
                                this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                                    if(a[0]<b[0]) 
                                        return -1;
                                    return 1;
                                });
                                this.createSaveDialog();
                                // this.createNewSignDialog(this.clipsTimeline.lastClipsSelected, "server");                            
                        }
                    }
                );
            }
            else{
                actions.push(
                    {
                        title: "Add behaviour",
                        callback: this.createClipsDialog.bind(this)
                    },                    
                    {
                        title: "Add animation",
                        callback: this.createServerClipsDialog.bind(this)
                    }
                );
                
                if(this.clipsTimeline.clipboard)
                {
                    actions.push(
                        {
                            title: "Paste",// + " <i class='bi bi-clipboard-fill float-right'></i>",
                            callback: () => this.clipsTimeline.pasteContent()
                        }
                    );
                    actions.push(
                        {
                            title: "Paste Here",
                            callback: () => {
                                this.clipsTimeline.pasteContent( this.clipsTimeline.xToTime(e.localX) );
                            }
                        }
                    );
                }
            }
            
            LX.addContextMenu("Options", e, (m) => {
                for(let i = 0; i < actions.length; i++) {
                    m.add(actions[i].title,  actions[i].callback )
                }
            });

        }

        this.clipsTimeline.onUpdateTrack = this.delayedUpdateTracks.bind(this); 
        this.clipsTimeline.onChangeTrackVisibility = (track, oldState) => { this.editor.updateTracks(); }
        this.timelineArea.attach(this.clipsTimeline.mainArea);
        this.clipsTimeline.canvas.tabIndex = 1;

        this.editor.activeTimeline = this.clipsTimeline;
    }
    
    /**
     * 
     * @param {Number} mode 0: type of clip, 1: type and hand 
     */
    reorderClips( mode = 0x00 ){
        const clipTypesOrder = [
            ANIM.SuperClip, 
            ANIM.FaceLexemeClip, ANIM.FaceFACSClip, ANIM.FaceEmotionClip, ANIM.FacePresetClip, ANIM.MouthingClip,
            ANIM.GazeClip, ANIM.HeadClip,  
            ANIM.ElbowRaiseClip, ANIM.ShoulderClip, ANIM.BodyMovementClip,
            ANIM.ArmLocationClip,
            ANIM.DirectedMotionClip, ANIM.CircularMotionClip,
            ANIM.FingerplayMotionClip, ANIM.WristMotionClip,
            ANIM.PalmOrientationClip, ANIM.HandOrientationClip, ANIM.HandshapeClip, ANIM.HandConstellationClip
        ];

        const animationClip = this.clipsTimeline.animationClip;
        const tracks = animationClip.tracks;

        const oldStateEnabler = this.clipsTimeline.historySaveEnabler;
        this.clipsTimeline.historySaveEnabler = false;

        const groupList = {};

        for( let t = 0; t < tracks.length; ++t){

            this.clipsTimeline.historySaveEnabler = oldStateEnabler;
            this.clipsTimeline.saveState(t, t!=0);
            this.clipsTimeline.historySaveEnabler = false;
    
            const clips = tracks[t].clips;
            for( let c = 0; c < clips.length; ++c ){
                const clip = clips[c];
                let index = clipTypesOrder.indexOf(clip.constructor);
                if ( index == -1 ){ // It is a weird clip
                    index = clipTypesOrder.length; // add to the end of the list
                }

                let id = String.fromCharCode(index + 64);
                if ( mode && clip.properties && clip.properties.hand ){
                    id += "_" + clip.properties.hand;
                }
                const group = groupList[id];
                if ( !group ){ groupList[id] = [clip]; }
                else{ group.push(clip); }
            }

            this.clipsTimeline.clearTrack(t);
        }

        const groupListSorted = Object.keys(groupList).sort();
        
        let firstEmptyTrack = 0;
        let firstGroupTrack = 0;
        for( let g = 0; g < groupListSorted.length; ++g ){
            const groupClips = groupList[groupListSorted[g]];
            firstGroupTrack = firstEmptyTrack;
            for ( let c = 0; c < groupClips.length; ++c ){
                this.clipsTimeline.addClip(groupClips[c], -1, 0, firstGroupTrack);
                if ( firstEmptyTrack < tracks.length && tracks[firstEmptyTrack].clips.length > 0 ){
                    firstEmptyTrack++;
                }
            }
        }
        // for( let g = 0; g < sortedList.length; ++g ){
        //     const groupClips = sortedList[g];
        //     firstGroupTrack = firstEmptyTrack;
        //     for ( let c = 0; c < groupClips.length; ++c ){
        //         this.clipsTimeline.addClip(groupClips[c], -1, 0, firstGroupTrack);
        //         if ( firstEmptyTrack < tracks.length && tracks[firstEmptyTrack].clips.length > 0 ){
        //             firstEmptyTrack++;
        //         }
        //     }
        // }

        this.clipsTimeline.historySaveEnabler = oldStateEnabler;
    }

    dataToBMLClips(data, mode) {
        //assuming data.behaviours starts at 0, like it is in "local time"

        let clips = [];
        let globalStart = 9999999;
        let globalEnd = -9999999;
        let glossStart = 9999999;
        let glossClips = [];
        let gloss = "";
        let unnamedGlosses = 0;

        if(data && data.behaviours) {
            for(let i = 0; i < data.behaviours.length; i++) {
                let clipClass = null;
                if(!data.indices){
                    switch(data.behaviours[i].type) {
                        case "gaze":
                            clipClass = ANIM.GazeClip;
                            break;
                        case "gazeShift":
                            clipClass = ANIM.GazeClip;
                            break;
                        case "head":
                            clipClass = ANIM.HeadClip;
                            break;
                        case "headDirectionShift":
                            clipClass = ANIM.HeadClip;
                            break;
                        case "face":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "faceLexeme":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "faceFACS":
                            clipClass = ANIM.FaceFACSClip;
                            break;
                        case "faceEmotion":
                            clipClass = ANIM.FaceEmotionClip;
                            break;
                        case "faceVA":
                            break;
                        case "faceShift":
                            clipClass = ANIM.FaceLexemeClip;
                            break;
                        case "speech":
                            clipClass = ANIM.MouthingClip;
                            break;
                        case "gesture":
                        {
                            if(data.behaviours[i].handConstellation)
                                clipClass = ANIM.HandConstellationClip;
                            else if(data.behaviours[i].bodyMovement)
                                clipClass = ANIM.BodyMovementClip;
                            else if(data.behaviours[i].elbowRaise)
                                clipClass = ANIM.ElbowRaiseClip;
                            else if(data.behaviours[i].shoulderRaise || data.behaviours[i].shoulderHunch)
                                clipClass = ANIM.ShoulderClip;
                            else if(data.behaviours[i].locationBodyArm)
                                clipClass = ANIM.ArmLocationClip;
                            else if(data.behaviours[i].palmor)
                                clipClass = ANIM.PalmOrientationClip;
                            else if(data.behaviours[i].extfidir)
                                clipClass = ANIM.HandOrientationClip;
                            else if(data.behaviours[i].handshape)
                                clipClass = ANIM.HandshapeClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "directed")
                                clipClass = ANIM.DirectedMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "circular")
                                clipClass = ANIM.CircularMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "wrist")
                                clipClass = ANIM.WristMotionClip;
                            else if(data.behaviours[i].motion && data.behaviours[i].motion.toLowerCase() == "fingerplay")
                                clipClass = ANIM.FingerplayMotionClip;
                            break;
                        }                       
                    }
                }
                else {
                    clipClass = ANIM.clipTypes[data.indices[i]];
                }

                if(clipClass){
                    glossStart = Math.min(glossStart, data.behaviours[i].start >= 0 ? data.behaviours[i].start : glossStart);
                    globalStart = Math.min(globalStart, data.behaviours[i].start >= 0 ? data.behaviours[i].start : globalStart);
                    globalEnd = Math.max(globalEnd, data.behaviours[i].end || globalEnd);
                                  
                    clips.push(new clipClass( data.behaviours[i]));        
                    
                }

                if(mode == ClipModes.Glosses) {

                    // save previous gloss clips before changing to new one (or end of behaviours)
                    if((data.behaviours[i].gloss || i == data.behaviours.length - 1)) {
                        if ( clips.length ){
                            if ( !gloss || !gloss.length){
                                gloss = "UNNAMED_" + (unnamedGlosses++).toString(); 
                            }
                            let duration = globalEnd - glossStart;
                            glossClips.push(new ANIM.SuperClip( {start: glossStart, duration: (duration > 0) ? duration : 0, type: "glossa", id: gloss, clips, clipTimeMode: ANIM.SuperClip.clipTimeModes.GLOBAL}));
                        }
                        clips = [];
                        glossStart = 9999999;
                        gloss = data.behaviours[i].gloss;                    
                    }
                }        
            }
        }

        clips = glossClips.length ? glossClips : clips;
        let duration = Math.max( 0, globalEnd - globalStart );
        if (mode == ClipModes.Phrase){
            clips = [ new ANIM.SuperClip( {duration: duration, type: "glossa", id: data.name ?? "UNNAMED", clips, clipTimeMode: ANIM.SuperClip.clipTimeModes.GLOBAL} ) ]; 
        }
        return {clips: clips, duration: duration};
    }

    loadBMLClip(clip) {         
        let {clips, duration} = this.dataToBMLClips(clip, this.mode);
        this.clipsTimeline.addClips(clips, this.clipsTimeline.currentTime);
    }

    /** -------------------- SIDE PANEL (editor) -------------------- */
    createSidePanel() {

        // clear area
        while ( this.sidePanel.root.children.length ){
            this.sidePanel.root.children[0].remove();
        }
        this.sidePanel.sections = [];

        if(this.panelTabs) {
            this.panelTabs.root.remove();
        }

        // Animation & Character tabs
        const panelTabs = this.panelTabs = this.sidePanel.addTabs({fit: true});

        // Animation tab content
        const animationArea = new LX.Area({id: 'Animation'});
        const [animSide, tabsSide] = animationArea.split({id: "panel", type: "vertical", sizes: ["auto", "auto"], resize: false});
        panelTabs.add( "Animation", animationArea, {selected: true, onSelect: (e,v) => {
            
        }});

        this.animationPanel = new LX.Panel({id: "animation", icon: "PersonStanding"});
        animSide.attach(this.animationPanel);
        this.updateAnimationPanel( );
        
        this.clipPanel = new LX.Panel({id:"bml-clip"});
        tabsSide.attach(this.clipPanel);
        this.updateClipPanel( );
        
        // Character tab content
        const characterArea = new LX.Area({id: 'Character'});
        const characterPanel = characterArea.addPanel();
        this.createCharactersPanel( characterPanel ) ;
        
        panelTabs.add( "Character", characterArea, {selected: false, onSelect: (e,v) => {
            
        }});


        // while ( this.sidePanel.root.children.length ){
        //     this.sidePanel.root.children[0].remove();
        // }
        // this.sidePanel.sections = [];

        // const [top, bottom] = this.sidePanel.split({type: "vertical", resize: false, sizes: "auto"});
        
        // this.animationPanel = new LX.Panel({id:"animation"});
        // top.attach(this.animationPanel);
        // this.clipPanel = new LX.Panel({id:"bml-clip"});
        // bottom.attach(this.clipPanel);

        // this.updateAnimationPanel( );
        // this.updateClipPanel( );
    }

    updateAnimationPanel( options = {}) {
        let widgets = this.animationPanel;

        widgets.onRefresh = (o) => {

            o = o || {};
            widgets.clear();
            widgets.addTitle("Animation");

            const animation = this.editor.loadedAnimations[this.editor.currentAnimation] ?? {};
            widgets.addText("Name", animation.name, (v) =>{ 
                    if( v.length == 0){
                        LX.toast("Animation Rename: name cannot be empty", null, { timeout: 7000 } );
                    }
                    else if ( this.editor.loadedAnimations[v] && v != animation.name ){
                        LX.toast("Animation Rename: Another animation with this name already exists", null, { timeout: 7000 } );
                    }else{
                        this.editor.renameGlobalAnimation(animation.name, v);
                        this.clipsTimeline.updateHeader();
                    }
            } );

            widgets.addSeparator();
            widgets.addComboButtons("Dominant hand", [
                { value: "Left", selected: this.editor.dominantHand == "Left", callback: v => this.editor.dominantHand = v },
                { value: "Right", selected: this.editor.dominantHand == "Right", callback: v => this.editor.dominantHand = v }
            ], {});
            widgets.addButton(null, "Add behaviour", () => this.createClipsDialog(), {title: "CTRL+K"} )
            widgets.addButton(null, "Add animation", () => this.createServerClipsDialog(), {title: "CTRL+L"} )
            widgets.addSeparator();
        }
        widgets.onRefresh(options);
    }

    updateClipSyncGUI(checkCurve = true){
                
        // TODO
        // clip.fadein and clip.attackPeak && clip.ready hold the same value, a time in worldcoordinates. However, after creating a clip and placing it
        // in the timeline, the .start, .fadein .fadeout automatically changes to the currenttime (timeline) but the attackpeak, ready, relax do not.
        // This is a BUG that it is being ignored. The toJson fn from each clip already handles this. But it is still a bug.

        if ( this.clipsTimeline.lastClipsSelected.length != 1 ){ 
            return; 
        }

        const widgets = this.clipPanel;
        const clip = this.clipsTimeline.animationClip.tracks[this.clipsTimeline.lastClipsSelected[0][0]].clips[this.clipsTimeline.lastClipsSelected[0][1]];
        let w = null;

        w = widgets.get("Start");
        if ( w ) { 
            w.set(clip.start, true);
        }
        w = widgets.get("Duration");
        if ( w ) { 
            w.set(clip.duration, true);
        }


        if( clip.fadein != undefined ) { 
            clip.fadein = Math.clamp(clip.fadein, clip.start, clip.start + clip.duration); 
            w = widgets.get("Attack Peak (s)");
            if ( w ) { 
                clip.attackPeak = clip.fadein;
                w.setLimits(0, clip.fadeout - clip.start, 0.001);
                w.set(clip.fadein - clip.start, true);
            }
            w = widgets.get("Ready (s)");
            if ( w ) { 
                clip.ready = clip.fadein;
                w.setLimits(0, clip.fadeout - clip.start, 0.001);
                w.set(clip.fadein - clip.start, true);
            }
        }


        if( clip.fadeout != undefined ) { 
            clip.fadeout = Math.clamp(clip.fadeout, clip.fadein, clip.start + clip.duration); 
            w = widgets.get("Relax (s)");
            if ( w ) { 
                clip.relax = clip.fadeout;
                w.setLimits( clip.fadein - clip.start, clip.duration, 0.001);
                w.set(clip.fadeout - clip.start, true);
            }
        }

        if( clip.strokeStart != undefined ) { 
            clip.strokeStart = Math.clamp(clip.strokeStart, clip.fadein, clip.fadeout); 
            w = widgets.get("Stroke start (s)");
            if ( w ) { 
                w.setLimits( clip.fadein - clip.start, clip.fadeout - clip.start, 0.001);
                w.set(clip.strokeStart - clip.start, true);
            }
        }
        if( clip.strokeEnd != undefined ) { 
            clip.strokeEnd = Math.clamp(clip.strokeEnd, clip.strokeStart ?? clip.fadein, clip.fadeout); 
            w = widgets.get("Stroke end (s)");
            if ( w ) { 
                w.setLimits( (clip.strokeStart ?? clip.fadein) - clip.start, clip.fadeout-clip.start, 0.001);
                w.set(clip.strokeEnd - clip.start, true);
            }
        }
        if( clip.stroke != undefined ) { 
            clip.stroke = Math.clamp(clip.stroke, clip.strokeStart ?? clip.fadein, clip.strokeEnd ?? clip.fadeout); 
            w = widgets.get("Stroke (s)");
            if ( w ) { 
                w.setLimits( (clip.strokeStart ?? clip.fadein) - clip.start, (clip.strokeEnd ?? clip.fadeout) - clip.start, 0.001);
                w.set(clip.stroke - clip.start, true);
            }
        }

        if ( checkCurve ) {
            w = widgets.get("Synchronization");
            if ( w ) {
                w.set([[(clip.fadein-clip.start)/clip.duration,0.5],[(clip.fadeout-clip.start)/clip.duration,0.5]], true);
            }
        }
        
    }

    /** Non -manual features based on BML */
    updateClipPanel(clip) {
        
        let widgets = this.clipPanel;
        if(this.clipsTimeline.lastClipsSelected.length > 1) {
            clip = null;
        }

        widgets.onRefresh = (clip) => {

            widgets.clear();
            if(!clip) {
                if(this.clipsTimeline.lastClipsSelected.length > 1) {
                    widgets.addButton(null, "Create preset", (v, e) => this.createSaveDialog( "presets" ))//this.createNewPresetDialog());
                }
                return;
            }
            
            this.clipInPanel = clip;
            const updateTracks = () => {
                if(!clip)
                    return;

                if(clip && clip.start + clip.duration > this.clipsTimeline.duration) {
                    this.clipsTimeline.setDuration(clip.start + clip.duration);
                }
                this.delayedUpdateTracks();
            }

            widgets.widgets_per_row = 1;
            // this.clipPanel.branch(clip.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g).join(" "));

            let icon = "ChildReaching";

            if(clip.constructor.name.includes("Face")) 
                icon = "Smile"
            else if(clip.constructor.name.includes("Mouthing")) 
                icon = "MessageCircleMore";
            else if(clip.constructor.name.includes("Head"))
                icon = "User";
            else if(clip.constructor.name.includes("Gaze"))
                icon = "Eye";
            else if(clip.constructor.name.includes("Super")) 
                icon = "ClapperboardClosed";

            let clipName = clip.constructor.name.includes("Super") ? "Glossa Clip" : clip.constructor.name.match(/[A-Z][a-z]+|[0-9]+/g).join(" ");
            widgets.addTitle(clipName, {icon} );
            widgets.addText("Id", clip.id, (v) => this.clipInPanel.id = v)
            
            widgets.branch("Content");
            if(clip.showInfo)
            {
                clip.showInfo(widgets, updateTracks);
            }
            else{
                for(var i in clip.properties)
                {
                    var property = clip.properties[i];
                    switch(property.constructor)
                    {
                        
                        case String:
                            widgets.addText(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                            });
                            break;
                        case Number:
                            if(i=="amount")
                            {
                                widgets.addNumber(i, property, (v,e,n) => 
                                {
                                    this.clipInPanel.properties[n] = v;
                                    updateTracks();
                                }, {min:0, max:1, step:0.01, precision: 2});
                            }
                            else{
                                widgets.addNumber(i, property, (v, e, n) =>
                                {
                                    this.clipInPanel.properties[n] = v;
                                    updateTracks();
                                }, {precision: 2});
                            }
                            break;
                        case Boolean:
                            widgets.addCheckbox(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                                updateTracks();
                            });
                            break;
                        case Array:
                            widgets.addArray(i, property, (v, e, n) =>
                            {
                                this.clipInPanel.properties[n] = v;
                                updateTracks();
                            });
                            break;
                    }
                }
            }
            widgets.merge()
            widgets.branch("Time", {icon: "Clock"});
	
            widgets.addNumber("Start", clip.start.toFixed(2), (v) =>
            {     
                const selectedClip = this.clipsTimeline.lastClipsSelected[0];
                const trackIdx = selectedClip[0];
                const track = this.clipsTimeline.animationClip.tracks[trackIdx];
                const clipIdx = selectedClip[1];
                if ( clipIdx == 0){ v = Math.max( 0, v ); }
                if ( clipIdx < track.clips.length-1 ){ v = Math.min( v, track.clips[clipIdx+1].start - clip.duration - 0.00001 ); }
                let diff = v - clip.start;  
                if(clip.attackPeak != undefined)      
                    clip.attackPeak = clip.fadein += diff;
                if(clip.ready != undefined)      
                    clip.ready = clip.fadein += diff;
                if(clip.relax != undefined)
                    clip.relax = clip.fadeout += diff;
                if(clip.strokeStart != undefined) 
                    clip.strokeStart += diff;
                if(clip.stroke != undefined) 
                    clip.stroke += diff;
                if(clip.strokeEnd != undefined) 
                    clip.strokeEnd += diff;
                this.clipInPanel.start = v;
                clip.start = v;
                
                if(clip.onChangeStart) {
                    clip.onChangeStart(diff);
                }
				this.updateClipSyncGUI();
                updateTracks();
                
            }, {min:0, step:0.01, precision:2});

            widgets.addNumber("Duration", clip.duration.toFixed(2), (v) =>
            {

                const selectedClip = this.clipsTimeline.lastClipsSelected[0];
                const trackIdx = selectedClip[0];
                const track = this.clipsTimeline.animationClip.tracks[trackIdx];
                const clipIdx = selectedClip[1];
                if ( clipIdx < track.clips.length-1 ){ v = Math.min( v, track.clips[clipIdx+1].start - clip.start - 0.00001 ); }
                clip.duration = v;
                this.clipInPanel.duration = v;              
               
                this.updateClipSyncGUI();
                updateTracks();

            }, {min:0.01, step:0.001, precision:2, disabled: clip.type == "custom"});

            if(clip.fadein!= undefined && clip.fadeout!= undefined)  {
                widgets.merge();
                widgets.branch("Sync points", {icon: "SplinePointer"});
                widgets.addTextArea(null, "These sync points define the dynamic progress of the action. They are normalized by duration.", null, {disabled: true,  className: "nobg"});
                const syncvalues = [];
                
                if(clip.fadein != undefined)
                {
                    syncvalues.push([(clip.fadein - clip.start)/clip.duration, 0.5]);
                    if(clip.attackPeak != undefined)
                        // clip.attackPeak = clip.fadein = Math.clamp(clip.start, clip.relax);
                        widgets.addNumber("Attack Peak (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.attackPeak = clip.fadein = v + clip.start;
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min:0, max: clip.fadeout - clip.start, step:0.001, precision:2, title: "Maximum action achieved"});
                    
                    if(clip.ready != undefined)
                        widgets.addNumber("Ready (s)", (clip.fadein - clip.start).toFixed(2), (v) =>
                        {              
                            clip.ready = clip.fadein = v + clip.start;
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min:0, max: clip.fadeout - clip.start, step:0.001, precision:2, title: "Target acquired or end of the preparation phase"});
                }

                if(clip.strokeStart != undefined) {

                    // clip.strokeStart = Math.clamp(clip.strokeStart, clip.ready, clip.stroke);
                    widgets.addNumber("Stroke start (s)", (clip.strokeStart - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeStart = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.ready - clip.start, max: clip.stroke - clip.start, step:0.001, precision:2, title: "Start of the stroke"});
                }

                if(clip.stroke != undefined) {
                    // clip.stroke = Math.clamp(clip.stroke, clip.strokeStart, clip.strokeEnd);
                    
                    widgets.addNumber("Stroke (s)", (clip.stroke - clip.start).toFixed(2), (v) =>
                    {              
                        clip.stroke = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.strokeStart - clip.start, max: clip.strokeEnd - clip.start, step:0.001, precision:2, title: "Stroke of the motion"});
                }

                if(clip.strokeEnd != undefined) {
                    // clip.strokeEnd = Math.clamp(clip.strokeEnd, clip.stroke, clip.relax); 

                    widgets.addNumber("Stroke end (s)", (clip.strokeEnd - clip.start).toFixed(2), (v) =>
                    {              
                        clip.strokeEnd = v + clip.start;
                        this.updateClipSyncGUI();
                        updateTracks();
                    }, {min: clip.stroke - clip.start, max: clip.relax - clip.start, step:0.001, precision:2, title: "End of the stroke"});
                }


                if(clip.fadeout != undefined) 
                {
                    syncvalues.push([(clip.fadeout - clip.start)/clip.duration, 0.5]);
                    
                    if(clip.relax != undefined)
                        // clip.relax = clip.fadeout = Math.clamp(clip.relax, clip.strokeEnd, clip.start + clip.duration); 
                        widgets.addNumber("Relax (s)", (clip.fadeout - clip.start).toFixed(2), (v) =>
                        {              
                            clip.relax = clip.fadeout = v + clip.start;
                            if(clip.attackPeak != undefined)
                                clip.attackPeak = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);

                            if(clip.ready != undefined)
                                clip.ready = clip.fadein = Math.clamp( clip.fadein, clip.start, clip.relax);
                            this.updateClipSyncGUI();
                            updateTracks();

                        }, {min: clip.fadein - clip.start, max: clip.duration , step:0.001, precision:2, title: "Decay or retraction phase starts"});
                }

                if(syncvalues.length) {
                   
                    this.curve = widgets.addCurve("Synchronization", syncvalues, (value, event) => {
                        // if(event && event.type != "mouseup") return;
                        if(clip.fadein!= undefined) {
                            clip.fadein = value[0][0]*clip.duration + clip.start;
                            if(clip.attackPeak != undefined)
                                clip.attackPeak = clip.fadein;
                            if(clip.ready != undefined)
                                clip.ready = clip.fadein;
                        }
                        if(clip.fadeout!= undefined) {
                            clip.relax = clip.fadeout = value[1][0]*clip.duration + clip.start;
                        }
                        this.updateClipSyncGUI(false);       
                        updateTracks();
                    }, {xrange: [0, 1], yrange: [0, 1], skipReset: true, allowAddValues: false, moveOutAction: LX.CURVE_MOVEOUT_CLAMP, draggableY: false, smooth: 0.2});
                }
                widgets.merge();
            }

            widgets.addButton(null, "Delete", (v, e) => {
                const selection = this.clipsTimeline.lastClipsSelected[this.clipsTimeline.lastClipsSelected.length - 1];
                this.clipsTimeline.deleteClip(selection[0], selection[1]);
                clip = null;  
                updateTracks(); 
                this.delayedUpdateTracks();
                this.updateClipPanel();
            });
            
        }
        widgets.onRefresh(clip);
        
    }

    showGuide() {       
        this.prompt = new LX.Dialog("How to start?", (p) =>{
            LX.makeContainer( [ "100%", "auto" ], "p-8 whitespace-pre-wrap text-lg", 
                "You can create an animation from a selected clip or from a preset configuration. You can also import animations or presets in JSON format following the BML standard. <br> <br> Go to 'Help' for more information about the application.", 
                p.root, 
                { wordBreak: "break-word", lineHeight: "1.5rem" } );
        }, {closable: true, onclose: (root) => {
            root.remove();
            this.prompt = null;
            LX.popup("Click on Timeline tab to discover all the available interactions.", "Useful info!", {position: [ "10px", "50px"], timeout: 5000})
        },
        modal: true
    })

    }

    createAvailableAnimationsTable(){

        const animations = this.editor.loadedAnimations;
        let availableAnimations = [];
        for ( let aName in animations ){
            let numClips = 0;
            animations[aName].scriptAnimation.tracks.forEach((v,i,arr) =>{ numClips += v.clips.length } );
            availableAnimations.push([ aName, numClips , animations[aName].scriptAnimation.duration.toFixed(3) ]);
        }

        let table = new LX.Table(null, {
                head: ["Name",  "Num. Clips", "Duration (s)"],
                body: availableAnimations
            },
            {
                selectable: true,
                sortable: true,
                toggleColumns: true,
                filter: "Name",
                // TODO add a row icon to modify the animations name
            }
        );
        return table;
    }

    createSaveDialog( folder ) {
        this.showExportAnimationsDialog( "Save animations in server", ( info ) => {

            const saveDataToServer = ( location ) => {
                let animations = this.editor.export(info.selectedAnimations, info.format, false);
                if(info.from == "Selected clips") {
                    this.clipsTimeline.lastClipsSelected.sort((a,b) => {
                        if( a[0]<b[0] ) {
                            return -1;
                        }
                        return 1;
                    });
                    
                    const presetData = { clips:[], duration:0 };

                    let globalStart = 10000;
                    let globalEnd = -10000;
                    let clips = this.clipsTimeline.lastClipsSelected;
                    for( let i = 0; i < clips.length; i++ ) {
                        const [trackIdx, clipIdx] = clips[i];
                        const clip = this.clipsTimeline.animationClip.tracks[trackIdx].clips[clipIdx];
                        if(clip.attackPeak!=undefined) clip.attackPeak = clip.fadein;
                        if(clip.ready!=undefined) clip.ready = clip.fadein;
                        if(clip.strokeStart!=undefined) clip.strokeStart = clip.fadein;
                        if(clip.relax!=undefined) clip.relax = clip.fadeout;
                        if(clip.strokeEnd!=undefined) clip.strokeEnd = clip.fadeout;
                        presetData.clips.push(clip);
                        globalStart = Math.min(globalStart, clip.start >= 0 ? clip.start : globalStart);
                        globalEnd = Math.max(globalEnd, clip.end || (clip.duration + clip.start) || globalEnd);
                    }
                    presetData.duration = globalEnd - globalStart;
                    presetData.preset = animations[0].name;
                    const preset = new ANIM.FacePresetClip( presetData );
    
                    //Convert data to bml file format
                    const data = preset.toJSON();
                    presetData.data = data.clips;
                    animations = [{name: animations[0].name, data: UTILS.dataToFile(JSON.stringify(presetData.data), animations[0].name, "application/json")}]
                }

                for( let i = 0; i < animations.length; i++ ) {                    
                    this.editor.uploadData(animations[i].name, animations[i].data, info.folder, location, () => {
                        this.closeDialogs();
                        LX.popup('"' + animations[i].name + '"' + " uploaded successfully.", "New clip!", {position: [ "10px", "50px"], timeout: 5000});
                    })
                }
            }
            const session = this.editor.remoteFileSystem.session;
            const user = session ? session.user : ""
            if( !user || user.username == "guest" ) {
                this.prompt = new LX.Dialog("Alert", d => {
                    d.addTextArea(null, "The animation will be saved locally. You must be logged in to save it into server.", null, {disabled:true, className: "nobg"});
                    const btn = d.addButton(null, "Login", () => {
                        this.prompt.close();
                        this.showLoginModal();
                    }, {width:"50%", buttonClass:"accent"});
                    btn.root.style.margin = "0 auto";
                }, {closable: true, modal: true})
                
            }
            else {
                saveDataToServer("server");
            }
        }, {formats: [ "BML"], folders:["signs",  "presets"], from: ["All clips", "Selected clips"], selectedFolder: folder, selectedFrom: (folder == "signs" ? "All clips" : null) } );
    }

    createClipsDialog() {
        // Create a new dialog
        let that = this;
        if(this.prompt && this.prompt.root.checkVisibility())
            return;
        const innerSelect = (asset) => {
           
                that.clipsTimeline.unSelectAllClips();
                let config = {properties: {hand: this.editor.dominantHand}};
                switch(asset.type) {
                    case "FaceLexemeClip": case "HeadClip":
                        config = {lexeme: asset.id.toUpperCase()};
                        break;
                    case "GazeClip":
                        config = {influence: asset.id.toUpperCase()};
                        break;
                    case "ShoulderClip":
                        let type = asset.id.split(" ")[1];
                        config["shoulder" + type] = 0.8;
                        break;
                    case "HandConstellationClip":
                        config.srcFinger = 1;
                        config.srcLocation = "Pad";
                        config.srcSide = "Back";
                        config.dstFinger = 1;
                        config.dstLocation = "Base";
                        config.dstSide = "Palmar"; 
                        break;    
                }

                that.clipsTimeline.addClip( new ANIM[asset.type](config), -1, that.clipsTimeline.currentTime);
                asset_browser.clear();
                dialog.close();
        }
        let previewActions =  [{
            type: "Clip",
            name: 'Add clip', 
            callback: innerSelect,
            allowedTypes: ["Clip"]
        }];

        let asset_browser = null;
        let dialog = this.prompt = new LX.Dialog('Available behaviours', (p) => {

            let asset_data = [{id: "Face", type: "folder", children: []}, {id: "Head", type: "folder",  children: []}, {id: "Arms", type: "folder",  children: []}, {id: "Hands", type: "folder",  children: []}, {id: "Body", type: "folder",  children: []}];
                
            // FACE CLIP

            // Face lexemes
            let values = ANIM.FaceLexemeClip.lexemes;
            let lexemes = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "FaceLexemeClip",
                    src: "./data/imgs/thumbnails/face lexemes/" + values[i].toLowerCase() + ".png"
                }
                lexemes.push(data);
            }
            previewActions.push({
                type: "FaceLexemeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // Face lexemes & Mouthing clips
            asset_data[0].children = [{ id: "Face lexemes", type: "folder", children: lexemes}, {id: "Mouthing", type: "MouthingClip"}];
            previewActions.push({
                type: "MouthingClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // HEAD
            // Gaze clip
            values = ANIM.GazeClip.influences;
            let gazes = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "GazeClip",
                }
                gazes.push(data);
            }

            previewActions.push({
                type: "GazeClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // Head movemen clip
            values = ANIM.HeadClip.lexemes;
            let movements = [];
            for(let i = 0; i < values.length; i++){
                let data = {
                    id: values[i], 
                    type: "HeadClip",
                }
                movements.push(data);
            }
            previewActions.push({
                type: "HeadClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            asset_data[1].children = [{ id: "Gaze", type: "folder", children: gazes}, {id: "Head movement", type: "folder", children: movements}];

            asset_data[2].children = [{id: "Elbow Raise", type: "ElbowRaiseClip"}, {id: "Shoulder Raise", type: "ShoulderClip"}, {id:"Shoulder Hunch", type: "ShoulderClip"}, {id: "Arm Location", type: "ArmLocationClip"}, {id: "Hand Constellation", type: "HandConstellationClip"}, {id: "Directed Motion", type: "DirectedMotionClip"}, {id: "Circular Motion", type: "CircularMotionClip"}];
            previewActions.push({
                type: "ElbowRaiseClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "ShoulderClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "ArmLocationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "HandConstellationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "DirectedMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "CircularMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            asset_data[3].children = [{id: "Palm Orientation", type: "PalmOrientationClip"}, {id: "Hand Orientation", type: "HandOrientationClip"}, {id: "Handshape", type: "HandshapeClip"}, {id: "Wrist Motion", type: "WristMotionClip"}, {id: "Fingerplay Motion", type: "FingerplayMotionClip"}];
            previewActions.push({
                type: "PalmOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "HandOrientationClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "WristMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            previewActions.push({
                type: "FingerplayMotionClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })
            // BODY
            asset_data[4].children.push({id: "Body movement", type: "BodyMovementClip"});
            previewActions.push({
                type: "BodyMovementClip",
                name: 'Add clip', 
                callback: innerSelect,
                allowedTypes: ["Clip"]
            })

            asset_browser = new LX.AssetView({ previewActions });
            p.attach( asset_browser );

            asset_browser.load( asset_data, (e,v) => {
                switch(e.type) {
                    case LX.AssetViewEvent.ASSET_SELECTED: 
                        if(e.multiple)
                            console.log("Selected: ", e.item); 
                        else
                            console.log(e.item.id + " selected"); 
                        break;
                    case LX.AssetViewEvent.ASSET_DELETED: 
                        console.log(e.item.id + " deleted"); 
                        break;
                    case LX.AssetViewEvent.ASSET_CLONED: 
                        console.log(e.item.id + " cloned"); 
                        break;
                    case LX.AssetViewEvent.ASSET_RENAMED:
                        console.log(e.item.id + " is now called " + e.value); 
                        break;
                    case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                        if(e.item.type == "folder")
                            return;
                        innerSelect(e.item);                        
                        break;
                }
            })
        },{ title:'Lexemes', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: true, contextMenu: false,
            onclose: (root) => {
            
                root.remove();
                this.prompt = null;
            }
         });
       
    }

    createServerClipsDialog() {
        
        const session = this.editor.remoteFileSystem.session;
       
        const username = session ? session.user.username : "guest";
        const repository = this.editor.remoteFileSystem.repository;

        if( this.prompt && this.prompt.root.checkVisibility() ) {
            return;
        }

        // Create a new dialog
        const dialog = this.prompt = new LX.Dialog('Available animations', async (p) => {
            
            const innerSelect = async (asset, button, e, action) => {
                const choice = document.getElementById("choice-insert-mode");
                if(choice) {
                    choice.remove();
                }
                switch(button) {
                    case "Add as single clip":
                        this.mode = ClipModes.Phrase;
                        break;
                    case "Breakdown into glosses":
                        this.mode = ClipModes.Glosses;
                        break;
                    case "Breakdown into action clips":
                        this.mode = ClipModes.Actions;
                        break;
                }
                this.clipsTimeline.unSelectAllClips();
                asset.animation.name = asset.id;

                dialog.panel.loadingArea.show();
                this.loadBMLClip(asset.animation)
                dialog.panel.loadingArea.hide();
    
                assetViewer.clear();
                dialog.close();
            }

            const previewActions = [
                {
                    type: "sigml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "sigml",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "sigml",
                    name: 'Breakdown into glosses', 
                    callback: innerSelect
                },
                {
                    type: "sigml",
                    name: 'Breakdown into action clips', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'View source', 
                    callback: this.showSourceCode.bind(this)
                },
                {
                    type: "bml",
                    name: 'Add as single clip', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'Breakdown into glosses', 
                    callback: innerSelect
                },
                {
                    type: "bml",
                    name: 'Breakdown into action clips', 
                    callback: innerSelect
                }
            ];

            if( username != "guest" ) {
                const folders = ["signs", "presets", "clips"];
                for( let i = 0; i < folders.length; i++ ) {
                    const folder = folders[i];
                    previewActions.push(
                    {
                        type: "sigml",
                        path: "@/Local/" + folder,
                        name: 'Upload to server', 
                        callback: (item)=> {
                            this.editor.uploadData(item.filename + ".sigml", item.data, folder, "server", () => {
                                this.closeDialogs();
                                LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New "+ folder +"!", {position: [ "10px", "50px"], timeout: 5000});
                                
                            });
                        }
                    });
                    previewActions.push({
                        type: "bml",
                        path: "@/Local/" + folder,
                        name: 'Upload to server', 
                        callback: (item)=> {
                            this.editor.uploadData(item.filename + ".bml", item.data, folder, "server", () => {
                                this.closeDialogs();
                                LX.popup('"' + item.filename + '"' + " uploaded successfully.", "New "+ folder +"!", {position: [ "10px", "50px"], timeout: 5000});
                                
                            });
                        }
                    });
                    previewActions.push({
                        type: "bvh",
                        path: "@/Local/" + folder,
                        name: 'Delete', 
                        callback: ( item )=> {
                            this.editor.localStorage[0].children.map( child => {
                                if( child.id == folder ) {
                                    const i = child.children.indexOf(item);
                                    const items = child.children;
                                    child.children = items.slice(0, i).concat(items.slice(i+1));  
                                }
                            })
                        }
                    });
                    previewActions.push({
                        type: "bvhe",
                        path: "@/Local/" + folder,
                        name: 'Delete', 
                        callback: ( item )=> {
                            cthis.editor.localStorage[0].children.map( child => {
                                if( child.id == folder ) {
                                    const i = child.children.indexOf(item);
                                    const items = child.children;
                                    child.children = items.slice(0, i).concat(items.slice(i+1));  
                                }
                            })                        
                        }
                    });    
                    previewActions.push({
                        type: "sigml",
                        path: "@/"+ username + "/" + folder,
                        name: 'Delete', 
                        callback: (item)=> {
                            this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                                if(v) {
                                    LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                    item.folder.children = v;
                                    assetViewer._deleteItem(item);
                                }
                                else {
                                    LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});
    
                                }
                                // this.closeDialogs();                            
                            });
                        }
                    });
                    previewActions.push({
                        type: "bml",
                        path: "@/"+ username + "/" + folder,
                        name: 'Delete', 
                        callback: (item)=> {
                            this.editor.remoteFileSystem.deleteFile( item.folder.unit, "animics/" + item.folder.id, item.id, (v) => {
                                if(v) {
                                    LX.popup('"' + item.filename + '"' + " deleted successfully.", "Clip removed!", {position: [ "10px", "50px"], timeout: 5000});
                                    item.folder.children = v;
                                    assetViewer._deleteItem(item);
                                }
                                else {
                                    LX.popup('"' + item.filename + '"' + " couldn't be removed.", "Error", {position: [ "10px", "50px"], timeout: 5000});
    
                                }
                                // this.closeDialogs();                            
                            });
                        }
                    });
                }
            }
            
            const assetViewer = new LX.AssetView({  allowedTypes: ["sigml", "bml"],  previewActions: previewActions, contextMenu: false});
            p.attach( assetViewer );
            
            const loadingArea = p.loadingArea = this.createLoadingArea(p);

            if( !repository.length ) {
                await this.editor.remoteFileSystem.loadAllUnitsFolders( () => {
                    let repository = this.editor.remoteFileSystem.repository;
                    this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                    loadingArea.hide();
                }, ["signs", "presets"]);
            }
            else {            
                this.loadAssets( assetViewer, [...repository, ...this.editor.localStorage], innerSelect );
                loadingArea.hide();
            }

            
        }, { title:'Available animations', close: true, minimize: false, size: ["80%", "70%"], scroll: true, resizable: true, draggable: false,  modal: true,
    
            onclose: (root) => {
                if( modal.destroy ) {
                    modal.destroy();
                }
                root.remove();

                this.prompt = null;
                if( !LX.modal.hidden ) {
                    LX.modal.toggle(true);
                }
                if( this.choice ) {
                    this.choice.close();
                }
            }
        });
    }

    loadAssets( assetViewer, repository, onSelectFile ) {
        assetViewer.load( repository , async e => {
            switch(e.type) {
                case LX.AssetViewEvent.ASSET_SELECTED: 
                    //request data
                    if( e.item.type == "folder" ) {
                        return;
                    }
                    
                    if( !e.item.animation ) {
                        const promise = new Promise((resolve) => {
                            this.editor.fileToAnimation(e.item, ( file ) => {
                                if( file ) {
                                    resolve(file);
                                }
                                else {
                                    resolve( null );
                                }
                            });
                        })

                        const parsedFile = await promise;
                        e.item.animation = parsedFile.animation;
                        e.item.content = parsedFile.content;
                    }
                    
                    if(e.multiple) {
                        console.log("Selected: ", e.item);
                    }
                    else {
                        console.log(e.item.id + " selected");
                    }
                        
                    break;
                case LX.AssetViewEvent.ASSET_DELETED: 
                    console.log(e.item.id + " deleted"); 
                    break;
                case LX.AssetViewEvent.ASSET_CLONED: 
                    console.log(e.item.id + " cloned"); 
                    break;
                case LX.AssetViewEvent.ASSET_RENAMED:
                    console.log(e.item.id + " is now called " + e.value); 
                    break;
                case LX.AssetViewEvent.ASSET_DBLCLICKED: 
                    if(e.item.type != "folder") {
                        const dialog = new LX.Dialog("Add clip", async (p) => {
                            if( !e.item.animation ) {
                                const promise = new Promise((resolve) => {
                                    this.editor.fileToAnimation(e.item, (file) => {
                                        if( file ) {
                                            resolve(file);
                                        }
                                        else {
                                            resolve( null );
                                        }
                                    });
                                })
                                const parsedFile = await promise;
                                e.item.animation = parsedFile.animation;
                                e.item.content = parsedFile.content;
                            }

                            p.addTextArea(null, "How do you want to insert the clip?", null, {disabled:true, className: "nobg"});
                            p.sameLine(3);
                            p.addButton(null, "Add as single clip", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Phrase;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            }, {width: "33%"});
                            p.addButton(null, "Breakdown into glosses", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Glosses;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            }, {width: "33%"});
                            p.addButton(null, "Breakdown into action clips", (v) => {
                                dialog.close();
                                this.mode = ClipModes.Actions;
                                this.closeDialogs();
                                onSelectFile(e.item, v);
                            }, {width: "33%"});
                        }, {modal:true, closable: true, id: "choice-insert-mode"})
                    }
                    break;

                case LX.AssetViewEvent.ENTER_FOLDER:
                    if( e.item.unit && !e.item.children.length ) { 
                        assetViewer.parent.loadingArea.show();

                        this.editor.remoteFileSystem.getFiles(e.item.unit, e.item.fullpath, (files, resp) => {
                            const files_data = [];
                            if( files ) {
                                
                                for( let f = 0; f < files.length; f++ ) {
                                    files[f].id = files[f].filename;
                                    files[f].folder = e.item;
                                    files[f].type = UTILS.getExtension(files[f].filename);
                                    files[f].lastModified = files[f].timestamp;
                                    if(files[f].type == "txt") {
                                        continue;
                                    }
                                    files_data.push(files[f]);
                                }
                                e.item.children = files_data;
                            }
                            assetViewer.currentData = files_data;
                            assetViewer._updatePath(assetViewer.currentData);

                            if( !assetViewer.skipBrowser ) {
                                assetViewer._createTreePanel();
                            }
                            assetViewer._refreshContent();

                            assetViewer.parent.loadingArea.hide();
                        })
                    }
                    break;
            }
        })
    }

    showSourceCode (asset) {
        if( window.dialog ) {
            window.dialog.destroy();
        }
    
        window.dialog = new LX.PocketDialog("Editor", p => {
            const area = new LX.Area();
            p.attach( area );

            const filename = asset.filename;
            const type = asset.type;
            const name = filename.replace("."+ type, "");
            
            const codeEditor = new LX.CodeEditor(area, {
                allow_add_scripts: false,
                name: type,
                title: name,
                disable_edition: true
            });

            const text = JSON.stringify(asset.animation.behaviours, (key, value) => {
                // limit precision of floats
                if( typeof value === 'number' ) {
                    return parseFloat(value.toFixed(3));
                }
                if( key == "gloss" ) {
                    return value.replaceAll(":", "_")
                }
                return value;
            });
            if( asset.type == "sigml" ) {
                codeEditor.setText(asset.content);
                codeEditor.addTab("bml", false, name);
                codeEditor.openedTabs["bml"].lines = codeEditor.toJSONFormat(text).split('\n');
                codeEditor.openedTabs["bml"].language = 'JSON'
            }
            else {
                codeEditor.setText(codeEditor.toJSONFormat(text));
            }
            codeEditor._changeLanguage( "JSON" );
            
        }, { size: ["40%", "600px"], closable: true });

    }

    createSceneUI(area) {

        let editor = this.editor;
        let canvasButtons = [
            {
                name: 'GUI',
                property: 'showGUI',
                icon: 'Grid',
                selectable: true,
                selected: true,
                callback: (v, e) => {
                    editor.showGUI = !editor.showGUI;

                    editor.scene.getObjectByName('Grid').visible = editor.showGUI;
                  
                    if(editor.showGUI) {
                        this.showTimeline();
                        this.sidePanel.parentArea.reduce();                       
                        
                    } else {
                        this.hideTimeline();
                        this.sidePanel.parentArea.extend();

                    }
                }
            },
    
        ]
        this.canvasAreaOverlayButtons = area.addOverlayButtons(canvasButtons, { float: "htc" } );
    }

    
}

class PropagationWindow {

    /*
     * @param {Lexgui timeline} timeline must be valid 
     */
    constructor( timeline ){

        this.timeline = timeline; // will provide the canvas
        
        this.curveWidget = null; 
        this.showCurve = false;
        
        this.showLimits = false;

        this.enabler = true;
        this.resizing = 0; // -1 resizing left, 0 nothing, 1 resizing right

        this.time = 0; // seconds
        this.rightSide = 1; // seconds
        this.leftSide = 1;  // seconds

        this.opacity = 0.6;
        this.lexguiColor = '#273162';
        this.gradientColorLimits = "rgba( 39, 49, 98, 0%)"; // relies on lexgui input
        this.gradientColor = "rgba( 39, 49, 98"; // relies on lexgui input
        this.borderColor = LX.getThemeColor( "global-text-secondary" );
        this.gradient = [ [0.5,1] ]; // implicit 0 in the borders
        // radii = 100;

        // create curve Widget
        const bgColor = "#cfcdcd"; // relies on lexgui input
        const pointsColor = "#273162"; // relies on lexgui input
        const lineColor = "#1c1c1d"; // relies on lexgui input
        const lpos = timeline.timeToX( this.time - this.leftSide );
        const rpos = timeline.timeToX( this.time + this.rightSide );

        this.curveWidget = new LX.Curve( null, this.gradient, (v,e) => {
                if ( v.length <= 0){
                    this.curveWidget.curveInstance.element.value = this.gradient = [[0.5,1]];
                }
                this.curveWidget.curveInstance.redraw();
            },
            {xrange: [0,1], yrange: [0,1], allowAddValues: true, moveOutAction: LX.CURVE_MOVEOUT_DELETE, smooth: 0, signal: "@propW_gradient", width: rpos-lpos -0.5, height: 25, bgColor, pointsColor, lineColor } 
        );
        const curveElement = this.curveWidget.root; 
        curveElement.style.width = "fit-content";
        curveElement.style.height = "fit-content";
        curveElement.style.position = "fixed";
        curveElement.style.borderRadius = "0px";
        curveElement.children[0].style.borderRadius = "0px 0px " + timeline.trackHeight*0.4 +"px " + timeline.trackHeight*0.4 +"px";
        curveElement.style.zIndex = "0.5";
        curveElement.style.padding = "0px";

        this.updateTheme();
        LX.addSignal( "@on_new_color_scheme", (el, value) => {
            // Retrieve again the color using LX.getThemeColor, which checks the applied theme
            this.updateTheme();
        } )
    }

    updateTheme(){
        this.borderColor = LX.getThemeColor( "global-text-secondary" );
    }

    setEnabler( v ){
        this.enabler = v;
        if(!v) {
            this.setCurveVisibility( false );
        }
        LX.emit( "@propW_enabler", this.enabler );
    }
    
    toggleEnabler(){
        this.setEnabler( !this.enabler );
    }

    recomputeGradient( newLeftSide, newRightSide ){
        let g = this.gradient;

        const oldMid = this.leftSide / (this.leftSide + this.rightSide);
        const newMid = newLeftSide / (newLeftSide + newRightSide);
        for( let i  = 0; i < g.length; ++i ){
            let gt = g[i][0]; 
            if ( gt <= oldMid ){
                g[i][0] = ( gt / oldMid ) * newMid;
            }
            else{
            g[i][0] = ( (gt - oldMid) / (1-oldMid)) * (1-newMid) + newMid ;
            }
        }

        this.leftSide = newLeftSide;
        this.rightSide = newRightSide;
    }

    setTimeline( timeline ){
        this.timeline = timeline;
        
        this.curveWidget.root.remove(); // remove from dom, wherever this is
        if(this.showCurve){
            this.timeline.canvasArea.root.appendChild( this.curveWidget.root );
            this.updateCurve( true );
        }
    }

    setTime( time ){
        this.time = time;
        this.updateCurve(); // update only position
    }

    onOpenConfig(dialog){
        dialog.addToggle("Enable", this.enabler, (v) =>{
            this.setEnabler(v);
        }, { signal: "@propW_enabler"});

        dialog.sameLine();
        let w = dialog.addNumber("Min", this.leftSide, (v) => {
            this.recomputeGradient( v, this.rightSide );
            this.updateCurve(true);
        }, {min: 0.001, step: 0.001, units: "s", precision: 3, signal: "@propW_minT", width:"50%"});
        w.root.style.paddingLeft = 0;
        dialog.addNumber("Max", this.rightSide, (v) => {
            this.recomputeGradient( this.leftSide, v );
            this.updateCurve(true);
        }, {min: 0.001, step: 0.001, units: "s", precision: 3, signal: "@propW_maxT", width:"50%"});
        dialog.endLine();

        dialog.addColor("Color", this.lexguiColor, (value, event) => {
            this.lexguiColor = value;
            let rawColor = parseInt(value.slice(1,7), 16);
            let color = "rgba(" + ((rawColor >> 16) & 0xff) + "," + ((rawColor >> 8) & 0xff) + "," + (rawColor & 0xff);
            this.gradientColorLimits = color + ",0%)"; 
            this.gradientColor = color;
            this.curveWidget.curveInstance.element.pointscolor = value;
            this.curveWidget.curveInstance.redraw();

            this.opacity = parseInt(value[7]+value[8], 16) / 255.0;
            this.curveWidget.root.style.opacity = this.opacity;
        }, {useAlpha: true});
    }

    onMouse( e, time ){

        if( !this.enabler ){ return false; }

        const timeline = this.timeline;

        const windowRect = this._getBoundingRectInnerWindow();
        const lpos = windowRect.rectPosX;
        const rpos = windowRect.rectPosX + windowRect.rectWidth;

        const timelineState = timeline.grabbing | timeline.grabbingTimeBar | timeline.grabbingScroll | timeline.movingKeys | timeline.boxSelection;
        
        const isInsideResizeLeft = Math.abs( e.localX - lpos ) < 7 && e.localY > windowRect.rectPosY;
        const isInsideResizeRight = Math.abs( e.localX - rpos ) < 7 && e.localY > windowRect.rectPosY;

        if ( !timelineState && ( isInsideResizeLeft || isInsideResizeRight ) ){
            timeline.canvas.style.cursor = "col-resize";
        }
        
        if ( e.type == "mousedown" && (isInsideResizeLeft || isInsideResizeRight) ){
            this.resizing = isInsideResizeLeft ? -1 : 1; 
        }

        if( e.localX >= lpos && e.localX <= rpos && e.localY > windowRect.rectPosY && e.localY <= (windowRect.rectPosY + windowRect.rectHeight)) {
            this.showLimits = true;
        }
        else if(!this.resizing) { // outside of window
            
            if(e.type == "mousedown") {
                this.setCurveVisibility( false );
            }
            this.showLimits = false;
        }

        if ( this.resizing && e.type == "mousemove" ){
            if ( this.resizing == 1 ){
                const t = Math.max( 0.001, time - this.time );
                this.recomputeGradient(this.leftSide, t);
                LX.emit("@propW_maxT", t); 
            }else{
                const t = Math.max( 0.001, this.time - time );
                this.recomputeGradient(t, this.rightSide);
                LX.emit("@propW_minT", t); 
            }
            this.showLimits = true;
            if(this.showCurve) {
                this.updateCurve( true );
            }
        }
        else if(timeline.grabbing && this.showCurve) {
            this.updateCurve(); // update position of curvewidget
        }

        if ( e.type == "wheel" ){
            this.updateCurve(true);
        }

        if( this.resizing ){
            timeline.grabbing = false;
            timeline.grabbingTimeBar = false;
            timeline.grabbingScroll = false;
            timeline.movingKeys = false;
            timeline.timeBeforeMove = null;
            timeline.boxSelection = false;
            // timeline.unSelectAllKeyFrames();
            timeline.unHoverAll();

            if ( e.type == "mouseup" ){
                this.resizing = 0;
            }
        }
        
        return true;
    }

    onDblClick( e ) {
        if ( !this.enabler || !this.showLimits ){ return; }

        const timeline = this.timeline;
        const lpos = timeline.timeToX( this.time - this.leftSide );
        const rpos = timeline.timeToX( this.time + this.rightSide );

        if( e.localX >= lpos && e.localX <= rpos && e.localY > timeline.topMargin) {
            timeline.grabbing = false;
            this.setCurveVisibility( true );
        }
    }

    setCurveVisibility( visibility ){
        if (!visibility){
            this.showCurve = false;
            this.curveWidget.root.remove(); // detach from timeline (if any)
        }else{
            const oldVisibility = this.showCurve;
            this.showCurve = true;
            if ( !oldVisibility ){ // only do update on visibility change
                this.timeline.canvasArea.root.appendChild( this.curveWidget.root );
                this.updateCurve(true);
            }
        }

    }

    updateCurve( updateSize = false ) {
        if( !(this.enabler && this.showCurve) ){ return false; }

        const timeline = this.timeline;

        const windowRect = this._getBoundingRectInnerWindow();

		let areaRect = timeline.canvas.getBoundingClientRect();

        this.curveWidget.root.style.left = areaRect.x + windowRect.rectPosX + "px";
        this.curveWidget.root.style.top = areaRect.y + windowRect.rectPosY + windowRect.rectHeight -2 + "px";

        if(updateSize) {
            const canvas = this.curveWidget.curveInstance.canvas;
            canvas.width = windowRect.rectWidth;
            canvas.style.width = windowRect.rectWidth + "px";


            const radii = timeline.trackHeight * 0.4;
			let leftRadius = windowRect.leftSize > radii ? radii : windowRect.leftSize;
	        leftRadius = windowRect.rectHeight > leftRadius ? leftRadius : (windowRect.rectHeight*0.5);
        
	        let rightRadius = windowRect.rightSize > radii ? radii : windowRect.rightSize;
	        rightRadius = windowRect.rectHeight > rightRadius ? rightRadius : (windowRect.rectHeight*0.5);

			canvas.style.borderBottomLeftRadius = leftRadius + "px";
			canvas.style.borderBottomRightRadius = rightRadius + "px";

            this.curveWidget.curveInstance.redraw();
        }
    }

    _getBoundingRectInnerWindow(){
        const timeline = this.timeline;
        let rightSize = timeline.timeToX(this.rightSide) - timeline.timeToX(0); 
        let leftSize = timeline.timeToX(this.leftSide) - timeline.timeToX(0);

        let rectWidth = leftSize + rightSize;
		let rectHeight = Math.min(
            timeline.canvas.height - timeline.topMargin - 2 - (this.showCurve ? this.curveWidget.curveInstance.canvas.clientHeight : 0), 
            timeline.leftPanel.root.children[1].children[0].clientHeight - timeline.leftPanel.root.children[1].scrollTop + timeline.trackHeight*0.5
        );
        rectHeight = Math.max( rectHeight, 0 );

        let rectPosX = timeline.timeToX( this.time - this.leftSide);
        let rectPosY = timeline.topMargin + 1;

        return { rightSize, leftSize, rectWidth, rectHeight, rectPosX, rectPosY };
    }

    draw( ){
        if ( !this.enabler || this.timeline.playing ){ return; }

        const timeline = this.timeline;
        const ctx = timeline.canvas.getContext("2d");

        let { rightSize, leftSize, rectWidth, rectHeight, rectPosX, rectPosY } = this._getBoundingRectInnerWindow();

        let gradient = ctx.createLinearGradient(rectPosX, rectPosY, rectPosX + rectWidth, rectPosY );
        gradient.addColorStop(0, this.gradientColorLimits);
        for( let i = 0; i < this.gradient.length; ++i){
            const g = this.gradient[i];
            gradient.addColorStop(g[0], this.gradientColor + "," + g[1] +")");
        }
        gradient.addColorStop(1,this.gradientColorLimits);
        ctx.fillStyle = gradient;
        ctx.strokeStyle = this.borderColor;
        const oldAlpha = ctx.globalAlpha;
        ctx.globalAlpha = this.opacity;

        // compute radii
        let radii = this.showCurve ? (timeline.trackHeight * 0.4) : timeline.trackHeight;
        let leftRadii = leftSize > radii ? radii : leftSize;
        leftRadii = rectHeight > leftRadii ? leftRadii : rectHeight;
        
        let rightRadii = rightSize > radii ? radii : rightSize;
        rightRadii = rectHeight > rightRadii ? rightRadii : rectHeight;
                
        let radiusTL, radiusBL, radiusTR, radiusBR;
        radiusTL = leftRadii;
        radiusBL = this.showCurve ? 0 : leftRadii;
        radiusTR = rightRadii;
        radiusBR = this.showCurve ? 0 : rightRadii;

        // draw window rect
        ctx.beginPath();

        ctx.moveTo(rectPosX, rectPosY + radiusTL);
        ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + radiusTL, rectPosY );
        ctx.lineTo( rectPosX + rectWidth - radiusTR, rectPosY );
        ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + radiusTR );
        ctx.lineTo( rectPosX + rectWidth, rectPosY + rectHeight - radiusBR );
        ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - radiusBR, rectPosY + rectHeight );
        ctx.lineTo( rectPosX + radiusBL, rectPosY + rectHeight );
        ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - radiusBL );

        ctx.closePath();
        ctx.fill();
        
        ctx.lineWidth = 1;
        if(this.showCurve) {
            rectHeight = rectHeight + this.curveWidget.curveInstance.canvas.clientHeight - 2;
            ctx.beginPath();
            ctx.lineTo(rectPosX, rectPosY + leftRadii);
            ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + leftRadii, rectPosY );
            ctx.lineTo( rectPosX + rectWidth - rightRadii, rectPosY );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + rightRadii );
            ctx.lineTo( rectPosX + rectWidth, rectPosY + rectHeight - rightRadii );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - rightRadii, rectPosY + rectHeight );
            ctx.lineTo( rectPosX + leftRadii, rectPosY + rectHeight );
            ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - leftRadii );
            ctx.closePath();
            ctx.stroke();
        }
        else if(this.showLimits){
            ctx.beginPath();
            ctx.moveTo(rectPosX, rectPosY + radiusTL*0.5);
            ctx.quadraticCurveTo(rectPosX, rectPosY, rectPosX + radiusTL*0.5, rectPosY );
            ctx.moveTo( rectPosX + rectWidth - radiusTR*0.5, rectPosY );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY, rectPosX + rectWidth, rectPosY + radiusTR*0.5 );
            ctx.moveTo( rectPosX + rectWidth, rectPosY + rectHeight - radiusBR*0.5 );
            ctx.quadraticCurveTo(rectPosX + rectWidth, rectPosY + rectHeight, rectPosX + rectWidth - radiusBR*0.5, rectPosY + rectHeight );
            ctx.moveTo( rectPosX + radiusBL*0.5, rectPosY + rectHeight );
            ctx.quadraticCurveTo(rectPosX, rectPosY + rectHeight, rectPosX, rectPosY + rectHeight - radiusBL*0.5 );
            ctx.stroke();
        }

        ctx.globalAlpha = oldAlpha;
        
    }
}

export { Gui, KeyframesGui, ScriptGui };
