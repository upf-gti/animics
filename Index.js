import { Animics } from './src/Animics.js'
import { UTILS } from './src/Utils.js'
import { LX } from 'lexgui';

// Wait until the session is loaded
UTILS.makeLoading("Loading application, please wait");

const animics = new Animics();
await animics.loadSession();		

const area = await LX.init( { rootClass: "" } );

// Menubar
const menubar = createMenuBar( area );
const sidebar = createSideBar( area );

const content = LX.makeContainer( ["100%", "100%"], "relative flex flex-col px-1", "", area );
createHome( content );
// createAbout( content )
createFooter();

bindEvents( area );
UTILS.hideLoading();

const body = area.root;
body.classList.remove("hidden");

function createMenuBar( area ) {
    
    const menubar = area.addMenubar( [] );
     // m.setButtonImage("Animics", "data/imgs/animics_logo_name.png", () => { window.location = window.location }, { float: "left" })				

    const buttonsContainer = LX.makeContainer( ["auto", "auto"], "flex flex-row gap-2 ml-auto", "", menubar.root);

    const signupButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto fg-primary border hover:bg-mix self-center content-center text-center cursor-pointer select-none", "Sign Up", buttonsContainer );
    signupButton.tabIndex = "1";
    signupButton.role = "button";
    signupButton.listen( "click", () => {} );			
    signupButton.id = "signup-button";

    const loginButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto bg-accent fg-white hover:bg-mix self-center content-center text-center cursor-pointer select-none", "Login", buttonsContainer );
    loginButton.tabIndex = "1";
    loginButton.role = "button";
    loginButton.listen( "click", () => {
        showLoginModal();
    } );
    loginButton.id = "login-button"

    const userButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto bg-accent fg-white hover:bg-mix self-center content-center text-center cursor-pointer select-none", animics.remoteFileSystem.session.user.username, buttonsContainer );
    userButton.tabIndex = "1";
    userButton.role = "button";
    userButton.listen( "click", () => {
        new LX.DropdownMenu( userButton, [
            
            { name: "Go to Database", icon: "Server", callback: () => { window.open("https://signon-lfs.gti.sb.upf.edu/src/", "_blank")} },
            { name: "Refresh", icon: "RotateCcw", callback: () => {} },
            null,
            { name: "Logout", icon: "LogOut", callback: () => { _logout() } },
            
        ], { side: "bottom", align: "end" });
    } );									
    userButton.id = "user-button";

    _checkSession();

    area = menubar.siblingArea;
    area.root.style.placeContent = "center";
    area.root.classList.add( "hidden" );
    return menubar;
}
            
function createSideBar( area ) {
    let swapValue = document.documentElement.getAttribute("data-theme") == "dark";
    const sidebar = area.addSidebar( m => {
        // m.group( "Projects", { icon: "Plus", callback: (groupName, event) => { console.log(groupName) }} );
        m.add( "Home", { icon: "House" /*,collapsable: false*/ } );
        m.add( "Documentation", { icon: "BookOpen" });
        m.add( "Documentation/Keyframe Animation", { xicon: "", callback:  () => { window.open( "docs/keyframe_animation.html" , "_blank" ) } } );
        m.add( "Documentation/Script Animation", { xicon: "", callback:  () => { window.open( "docs/script_animation.html" , "_blank" ) } } );
        m.add( "About", { icon: "Info", callback: () => {} });
        
        m.separator();
        
        m.add( "Switch Theme", { icon: "Sun", callback:  () => {swapValue = !swapValue; LX.setTheme( swapValue ? "light" : "dark" ) }})
        // m.add( "TÀNDEM", { callback: () => {} } );
    }, { 
        /* collapseToIcons: false, skipFooter: true, skipHeader: true,*/
        filter: false,
        headerTitle: "ANIMICS",
        // headerSubtitle: LX.version,
        headerImage: "./data/imgs/monster.png",
        // header: customHeader,
        footerTitle: "TÀNDEM",
        // footerSubtitle: "alexroco.30@gmail.com",
        footerImage: "./data/imgs/tandem_monster.png",
        // footer: customFooter,
        onHeaderPressed: (e) => { console.log( "onHeaderPressed" ) }, 
        onFooterPressed: (e, element) => {
            new LX.DropdownMenu( element, [
               "Pages",
                { name: "Main", callback: () => {} },
                { name: "Animics", callback: () => {} },
                { name: "Performs", callback: () => {} },
                null,
                { name: "Social Media", submenu: [
                    { name: "Github", link: "https://github.com/upf-gti/", icon:"Github@solid" },
                    { name: "Twitter", link: "https://x.com/gti_upf/", icon: "X-Twitter" },
                    { name: "Discord", link: "https://discord.gg/9YGrGjnycj", icon: "Discord" }
                ]}
            ], { side: "right", align: "end" });
        }
    });
    return sidebar;
}

function createHome( content ) {
    const mainContent = LX.makeContainer( ["100%", "calc(100% - 70px)"], "main-content bg-secondary flex flex-col p-6 rounded-lg", "", content );
    const headerContent = LX.makeContainer( ["100%", "auto"], "flex flex-row gap-4 my-6 overflow-scroll", "", mainContent );
    headerContent.style.minHeight = "256px";
    
    const keyframeContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Keyframe Animation", keyframeContent );
    const keyframeItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", keyframeContent );
    
    const emptyItem = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-3 p-3 text-md rounded-lg hover:bg-tertiary cursor-pointer", ``, keyframeItems );
    LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center content-center rounded-lg shadow-lg gap-3", `
        ${LX.makeIcon("CirclePlus", {svgClass:"xxxl fg-secondary"}).innerHTML}
        <p class="text-sm text-center px-4 fg-tertiary ">Create from scratch</p>
    `, emptyItem );
    LX.makeContainer( ["auto", "auto"], "", `<p>Empty project</p>`, emptyItem );
    emptyItem.id = "keyframe-project";

    const videoItem = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-3 p-3 text-md rounded-lg hover:bg-tertiary cursor-pointer", ``, keyframeItems );
    LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center rounded-lg shadow-lg gap-3", ` ${LX.makeIcon("ClapperboardClosed@solid", {svgClass:"xxxl fg-secondary"}).innerHTML}<p class="text-sm text-center px-4 fg-tertiary ">Upload video/s</p>`, videoItem );
    LX.makeContainer( ["auto", "auto"], "", `<p>From video/s</p>`, videoItem );
    videoItem.id = "video-project";

    const webcamItem = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-3 p-3 text-md rounded-lg hover:bg-tertiary cursor-pointer", ``, keyframeItems );
    LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center rounded-lg shadow-lg gap-3", ` ${LX.makeIcon("Camera@solid", {svgClass:"xxxl fg-secondary"}).innerHTML}<p class="text-sm text-center px-4 fg-tertiary ">Record yourself</p>`, webcamItem );
    LX.makeContainer( ["auto", "auto"], "", `<p>Real-time capture</p>`, webcamItem );
    webcamItem.id = "webcam-project";

    const scriptContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Script Animation", scriptContent );
    const scriptItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", scriptContent );
    const emptyScriptItem = LX.makeContainer( ["auto", "auto"], "flex flex-col  gap-3 p-3 text-md rounded-lg hover:bg-tertiary cursor-pointer", ``, scriptItems );
    LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center content-center rounded-lg shadow-lg gap-3", ` ${LX.makeIcon("CirclePlus@solid", {svgClass:"xxxl fg-secondary"}).innerHTML}<p class="text-sm text-center px-4 fg-tertiary ">Create from scratch</p>`, emptyScriptItem );
    LX.makeContainer( ["auto", "auto"], "", `<p>Empty project</p>`, emptyScriptItem );
    emptyScriptItem.id = "script-project";

    const fileContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Edit Animation", fileContent );
    const fileItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", fileContent );
    const fileItem = LX.makeContainer( ["auto", "auto"], "flex flex-col  gap-3 p-3 text-md rounded-lg hover:bg-tertiary cursor-pointer", ``, fileItems );
    LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center content-center rounded-lg shadow-lg gap-3", ` ${LX.makeIcon("FolderOpen@solid", {svgClass:"xxxl fg-secondary"}).innerHTML}<p class="text-sm text-center px-4 fg-tertiary ">Upload .bvh, .bvhe, .bml, .sigml or .json file/s</p>`, fileItem );
    LX.makeContainer( ["auto", "auto"], "", `<p>Drop file/s</p>`, fileItem );
    fileItem.id = "import";

    const projectsContent = LX.makeContainer( ["100%", "auto"], "flex flex-col gap-4 my-6 p-4 overflow-scroll", "", mainContent );
    LX.makeContainer( ["auto", "auto"], "font-bold", "Projects", projectsContent );
    const projectItems = LX.makeContainer( ["100%", "auto"], "grid gap-4", "", projectsContent );
    projectItems.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
    projectItems.id = "project-items-container";

    const projectText = LX.makeContainer( ["auto", "auto"],"text-md fg-secondary", "<p> Login to see your last projects. </p>", projectsContent);
    projectText.id = "project-text";

}

function createAbout( content ) {
    const mainContent = LX.makeContainer( ["100%", "100%"], "main-content bg-secondary flex flex-col items-center py-6 rounded-lg", "", content );
    
    const headerContent = LX.makeContainer( ["40%", "300px"], "flex flex-row gap-4 my-5 p-10 overflow-scroll items-end justify-center",'<img class="w-full" style="height:min-content" src="data/imgs/animics_logo_name.png">' , mainContent );

    
    const container = LX.makeContainer( ["100%", "calc(100% - 320px)"], "flex flex-col overflow-scroll items-center justify-center",'' , mainContent );
    container.style.background = "linear-gradient(0deg, black, transparent)";
    
    const textContent = LX.makeContainer( ["30%", "100px"], "flex justify-center",`<p class="text-xxl font-light text-center" >Animics is an online application to create and
    edit animations for 3D humanoid characters,
    focused in Sign Language synthesis.</p>` , container );

    const techContent = LX.makeContainer(["40%", "100px"], "flex flex-col items-center gap-4 my-10 fg-secondary font-bold", "" , container);
    const techText = LX.makeContainer(["auto","auto"], "py-6", `<p>Developed using</p>`, techContent);
    const techLinksContent = LX.makeContainer(["auto", "60px"], "flex flex-row justify-center gap-12", `
    <a class="h-full" href="https://chuoling.github.io/mediapipe/"><img class="h-full hover:scale" style="filter:grayscale(1) invert(0.5) brightness(1);" src="https://images.viblo.asia/d70d57f3-6756-47cd-a942-249cc1a7da82.png" alt="Mediapipe"></a>
    <a class="h-full" href="https://threejs.org/"><img class="h-full hover:scale" style="filter:invert(0.5);" src="https://needle.tools/_nuxt/logo-three.CiaNm32y.png" alt="Threejs"></a>
    <a class="h-full" href="https://github.com/jxarco/lexgui.js"><img class="h-full hover:scale" style="filter:grayscale(1) invert(0.5) brightness(1);" src="data/imgs/lexgui.png" alt="Lexgui"></a>`, techContent)

    const fundingContent = LX.makeContainer(["40%", "100px"], "flex flex-col items-center gap-4 my-10 fg-secondary font-bold", "" , container);
    const fundingText = LX.makeContainer(["auto","auto"], "py-6", `<p>Funded by</p>`, fundingContent);
    const linksContent = LX.makeContainer(["auto", "80px"], "flex flex-row justify-center gap-12", `
    <a class="h-full" href="https://signon-project.eu/"><img class="h-full hover:scale" style="filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/marco_SignON.png" alt="SignON"></a>
    <a class="h-full" href="https://www.upf.edu/web/emerald"><img class="h-full hover:scale" style="filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/marco_EMERALD.png" alt="EMERALD"></a>
    <a class="h-full" href="https://www.upf.edu/web/gti"><img class="h-full py-5 hover:scale" style="filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/GTIlogo.png" alt="UPF-GTI"></a>`, fundingContent);

    const devContent = LX.makeContainer(["100%", "auto"], "flex flex-col items-center py-5 my-10 bg-primary font-bold", "<h3>Implemented by</h3>" , container);
    const peopleItems = LX.makeContainer( ["40%", "auto"], "flex flex-row gap-4 my-5 p-10 overflow-scroll items-end justify-center",'' , devContent );

    _makePersonItem({name: "Víctor Ubieto Nogales", img: "https://www.upf.edu/documents/115100603/264407312/Victor_cropped.jpg/dd5ee7db-580d-c51c-b499-bbbacbbfbb9e?t=1679569197124", avatar:"https://models.readyplayer.me/671a74b007f4235f6e9adf46.png?camera=portrait&blendShapes[mouthSmile]=0.2", email: "victoremilio.ubieto@upf.edu", url:"https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/victor-ubieto-nogales/maximized"}, peopleItems);
    _makePersonItem({name: "Eva Valls Garolera", img: "https://www.upf.edu/documents/115100603/264407312/unnamed.png/9e17f242-5800-b95d-af77-dd03dbc91b7d?t=1679568161101", avatar:"https://models.readyplayer.me/66e30a18eca8fb70dcadde68.png?camera=portrait&blendShapes[mouthSmile]=0.2", email: "eva.valls@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/eva-valls-garolera/maximized"}, peopleItems);
    _makePersonItem({name: "Jaume Pozo Prades", img: "https://www.upf.edu/image/user_portrait?img_id=183376073&img_id_token=CykVYRbgc1iuesVtnp88oTFB8UA%3D&t=1745944004158", avatar:"https://models.readyplayer.me/671b724b0c8fdad50df16a8d.png?camera=portrait&blendShapes[mouthSmile]=0.2", email: "jaume.pozo@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/jaume-pozo-prades/maximized"}, peopleItems);
}

function _makeProjectItem( item ) {
    const projectText = document.getElementById("project-text");
    const projectItems = document.getElementById("project-items-container");
    projectText.classList.add("hidden");
    
    const itemContainer = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-4 p-4 text-md rounded-xl hover:bg-tertiary cursor-pointer", `
    <div class="rounded-xl w-full overflow-hidden">
        <img class="w-full hover:scale" style="object-fit:cover" src="${ item.img || "./docs/editStation.png"} ">
    </div>
    <div class="flex flex-row justify-between px-1">
        <div class="flex flex-col gap-0.5">
            <p>${ item.filename }</p>
            <p class="text-sm fg-tertiary">Last modified ${ item.timestamp }</p>
        </div>
        <a class="px-2 py-1 rounded-lg lexicon fa-solid fa-ellipsis-vertical"></a>
    </div>
    `, projectItems );
    itemContainer.addEventListener( "click", () => {
        onLoadFiles([{name: item.filename, fullpath: item.unit + "/" + item.folder + "/" + item.filename, type: "application/json"}]);
    })
    const optionsIcon = itemContainer.querySelector( ".lexicon" );
    optionsIcon.listen( "click", () => {
        new LX.DropdownMenu( optionsIcon, [
            { name: "Duplicate", icon: "Copy", callback: () => {} },
            null,
            { name: "Delete", icon: "Trash2" }
        ], { side: "bottom", align: "start" });
    } );

}

function _makePersonItem( item, container ) {
    
    const itemContainer = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-4 p-4 text-md rounded-xl hover:bg-tertiary cursor-pointer", `
    <div class="rounded-xl w-full overflow-hidden card">
        <div class="card-inner">
            <div class="card-front">
                <img class="w-full hover:scale" style="object-fit:cover" src="${ item.avatar || "./docs/editStation.png"} ">
            </div>
            <div class="card-back">
                <img class="w-full img-top" style="object-fit:cover" src="${ item.img || "./docs/editStation.png"} ">
            </div>
        </div>
    </div>
    <div class="flex flex-row justify-center px-1">
        <div class="flex flex-col items-center gap-0.5">
            <p>${ item.name }</p>
            <p class="text-sm fg-tertiary"> ${ item.email }</p>
        </div>
    </div>
    `, container );

    itemContainer.listen( "click", () => {
        window.open(item.url, "_blank");
    })
}

function createFooter() {
    const footer = new LX.Footer( {
        className: "left-0 bottom-0 absolute",
        parent: content,
        credits: `2021-${ new Date().getUTCFullYear() } GTI - UPF | Developed within <a href="https://signon-project.eu/" target="_blank">SignON</a> and EMERALD EU H2020 projects. Released under the Apache 2.0 License.`,
        socials: [
            { title: "Github", link: "https://github.com/upf-gti/", icon: `Github@solid` },
            { title: "X/Twitter", link: "https://x.com/gti_upf/", icon: `X-Twitter` },
            { title: "Discord", link: "https://discord.gg/9YGrGjnycj", icon: `Discord` }
        ]
    } );
    
    const footerCreditsSocials = footer.root.querySelector( ".credits-and-socials" );
    footerCreditsSocials.innerHTML = `<img src="data/imgs/GTIlogo.png" width="150px" style="filter:invert(0.5)" draggable="false">` + footerCreditsSocials.innerHTML;
    return footer;    
}

function bindEvents( area ) {    
    const keyframeBtn = document.getElementById("keyframe-project");
    const videoBtn = document.getElementById("video-project");
    const webcamBtn = document.getElementById("webcam-project");
    
    const scriptBtn = document.getElementById("script-project");
    const importBtn = document.getElementById("import");
    // Keyframe mode
    keyframeBtn.addEventListener("click", () => {
        startAnimics({mode: "keyframe"});
    });

    videoBtn.addEventListener("click", () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.click();
        input.onchange = (event) => { 
            onLoadFiles( event.currentTarget.files);
            // startAnimics({pendingResources: event.currentTarget.files})
        };
    });

    webcamBtn.addEventListener("click", () => {
        startAnimics({mode: "keyframe", capture: true});
    });

    // Script mode
    scriptBtn.addEventListener("click", () => {
        startAnimics({mode: "script"});
    });

    // Import resurces 
    importBtn.addEventListener("click", () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.click();
        input.onchange = (event) => { 
            onLoadFiles( event.currentTarget.files);
            // startAnimics({pendingResources: event.currentTarget.files})
        };
    });

    // Drag and Drop
    const body = area.root;
    const dropOver = LX.makeContainer(["100%", "100%"], "border-dashed overlay-top bg-blur","", body );
    dropOver.classList.add("hidden");

    body.ondragenter = ( event ) => {

        event.preventDefault();
        event.stopImmediatePropagation();
        dropOver.classList.remove("hidden");
        return false
    };

    window.ondragleave = ( event ) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.clientX === 0 && event.clientY === 0) {
            dropOver.classList.add("hidden");
        }
        return false
    };

    body.ondrop = (event) => {
        dropOver.classList.add("hidden");
        event.preventDefault();
        event.stopPropagation();
        if ( onLoadFiles( event.dataTransfer.files ) ){
            body.ondrop = null;
        }
    };

}

function startAnimics(settings) {
    const loadingAnim = UTILS.makeLoading("Starting Animics");
    loadingAnim.onfinish = () => {
        // Manually resetting lexgui
        LX.root.innerHTML = "";
        LX.main_area = new LX.Area( { id: 'mainarea' } );
        LX.doAsync( () => animics.init(settings), 150 );
    };			
    window.global = {app: animics};
}

function onLoadFiles( files ) {
    if(!files || !files.length) { 
        return null; 
    }
    
    let mode = null;
    let resultFiles = [];
    
    const animExtensions = ['bvh','bvhe', 'glb'];
    const scriptExtensions = ['json', 'bml', 'sigml'];

    // First valid file will determine the mode. Following files must be of the same format
    for( let i = 0; i < files.length; ++i ) {
        // MIME type is video
        if( files[i].type.startsWith("video/") ) {
            if ( !mode ) { 
                mode = "keyframe"; 
            }
            
            if ( mode == "keyframe" ) {			
                resultFiles.push( files[i] );
            }
            continue;
        }

        // other valid file formats
        const extension = UTILS.getExtension(files[i].name).toLowerCase();
                        
        if( animExtensions.includes(extension) ) {
            if ( !mode ) {
                mode = "keyframe";
            }
            
            if ( mode == "keyframe") {
                resultFiles.push( files[i] );
            }
        }

        if( scriptExtensions.includes(extension) ) {
            if ( !mode ) {
                mode = "script";
            }

            if ( mode == "script") {
                resultFiles.push( files[i] );
            }
        }
    }

    if ( resultFiles.length ) {
        return startAnimics({ mode, pendingResources: resultFiles});
    }	
        
    alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml', 'json'\n\tKeyframe animation: 'bvh', 'bvhe'");
    return null;
}

function showLoginModal() {
    let prompt = new LX.Dialog("Login", (p) => {
        
        const formData = { Username: "", Password: { value: "", type: "password" } };
        p.addForm("Login", formData, (value, event) => {
            animics.remoteFileSystem.login(value.Username, value.Password, (session, response) => {
                if(response.status == 1) {
                    
                    _checkSession();							
                }
                else {                           
                    //refresh(p, response.msg || "Can't connect to the server. Try again!");
                    LX.popup(response.msg || "Can't connect to the server. Try again!", "Error");
                }
                prompt.close();
                prompt = null;
            });
        }, { primaryActionName: "Login", secondaryActionName: "Sign Up", secondaryActionCallback: () =>{}} ) // this.showCreateAccountDialog({username, password});});
        
        
    }, {modal: true, closable: true} )
}

function _logout() {

    animics.remoteFileSystem.logout(() => {
        animics.remoteFileSystem.login("guest", "guest", () => {                    
            _checkSession();
        })

    }); 
}

function _checkSession() {

    const signupButton = document.getElementById("signup-button");
    const loginButton = document.getElementById("login-button");
    const userButton = document.getElementById("user-button");

    if(!animics.remoteFileSystem.session || !animics.remoteFileSystem.session.user || animics.remoteFileSystem.session.user.username == "guest") {
        signupButton.classList.remove("hidden");
        loginButton.classList.remove("hidden");
        userButton.classList.add("hidden");
        const projectsContent = document.getElementById("project-items-container");
        if(projectsContent) {
            projectsContent.innerHTML = "";
            const projectText = document.getElementById("project-text");
            projectText.classList.remove("hidden");
        }

    }
    else {
        signupButton.classList.add("hidden");
        loginButton.classList.add("hidden");
        userButton.classList.remove("hidden");
        userButton.innerHTML = animics.remoteFileSystem.session.user.username;
        // put name
        animics.remoteFileSystem.session.getLastFiles((files) => {
            for(const data of files) {
                
                _makeProjectItem( data );
            }
        })
    }
}