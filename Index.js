import { Animics } from './src/Animics.js'
import { UTILS } from './src/Utils.js'
import { LX } from 'lexgui';

// Wait until the session is loaded
UTILS.makeLoading("Loading application, please wait");

let limit = 10, offset = 0;

const animics = new Animics();
await animics.loadSession();		

const mobile = navigator && /Android|iPhone/i.test(navigator.userAgent);
LX.setThemeColor( 'blue' );
const area = await LX.init( { rootClass: "" } );

const dropOver = LX.makeContainer(["100%", "100%"], "border-dashed overlay-top bg-neutral-800 z-1","", LX.mainArea.root );
dropOver.classList.add("hidden");

// Menubar
let menubar = null;
let buttonsContainer = null;
const sidebar = createSideBar( area );
menubar = createMenuBar( area );

const content = LX.makeContainer( ["100%", "100%"], "relative flex flex-col px-1", "", area );

const home = createHome( content );
const about = createAbout( content );
createFooter();
bindEvents( area );

UTILS.hideLoading();

const body = area.root;
body.classList.remove("hidden");


function createMenuBar( area ) {
    
    // const menubar = area.addMenubar( [] );

    buttonsContainer = LX.makeContainer( ["auto", "auto"], "flex flex-row gap-2 ml-auto", "", menubar.root);

    const signupButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto text-primary border hover:bg-accent self-center content-center text-center cursor-pointer select-none", "Sign Up", buttonsContainer );
    signupButton.tabIndex = "1";
    signupButton.role = "button";
    LX.listen( signupButton, "click", () => {
        animics.showCreateAccountDialog( { user: "", password: "" }, _checkSession );
    } );			
    signupButton.id = "signup-button";

    const loginButton = LX.makeContainer( ["100px", "auto"], "text-md font-medium rounded-lg p-2 ml-auto bg-primary text-white hover:bg-mix self-center content-center text-center cursor-pointer select-none", "Login", buttonsContainer );
    loginButton.tabIndex = "1";
    loginButton.role = "button";
    LX.listen( loginButton, "click", () => {
        animics.showLoginModal( _checkSession );
    } );
    loginButton.id = "login-button"

    const userButton = LX.makeContainer( ["auto", "auto"], "max-w-3xl text-md font-medium rounded-lg p-2 ml-auto bg-primary text-white hover:bg-mix self-center content-center text-center cursor-pointer select-none", animics.fileSystem.session.user.username, buttonsContainer );
    userButton.tabIndex = "1";
    userButton.role = "button";
    LX.listen( userButton, "click", () => {
        new LX.DropdownMenu( userButton, [
            
            { name: "Go to Database", icon: "Server", callback: () => { window.open("https://dev-lfs.gti.upf.edu/src/", "_blank")} },
            { name: "Refresh", icon: "RotateCcw", callback: () => {
                offset = 0;
                appendAnimationFiles( true );
            } },
            null,
            { name: "Logout", icon: "LogOut", callback: () => { animics._logout( _checkSession ); } },
            
        ], { side: "bottom", align: "end" });
    } );									
    userButton.id = "user-button";

    _checkSession();

    area = menubar.siblingArea;
    area.root.style.placeContent = "center";
    return menubar;
}
            
function createSideBar( area ) {

    const starterTheme = LX.getMode();

    // so any theme trigger (browser, SO, anything) will update the image, not only the switch button
    LX.addSignal( "@on_new_color_scheme", ( el, value ) => {
        const img = document.getElementById("animics-img");
        const swapValue = value == "light";
        if( img ) {
            img.src = "data/imgs/logos/animics_" + (swapValue ? "black" : "white") + ".png";
        }
    } );

    const sidebarCallback = m => {
      m.add( "Home", { icon: "House", callback: () => { 
            about.classList.add("hidden");
            home.classList.remove("hidden");
         } } );
        m.add( "Documentation", { icon: "BookOpen" });
        m.add( "Documentation/Keyframe Animation", { xicon: "", callback:  () => { window.open( "docs/keyframe" , "_blank" ) } } );
        m.add( "Documentation/Script Animation", { xicon: "", callback:  () => { window.open( "docs/script" , "_blank" ) } } );
        m.add( "About", { icon: "Info", callback: () => { 
            home.classList.add("hidden");
            about.classList.remove("hidden");
        } });
        
        m.separator();
        
        m.add( "Switch Theme", {
            icon: starterTheme == "dark" ? "Sun" : "Moon",
            swap: starterTheme == "dark" ? "Moon" : "Sun",
            skipSelection: true, // Alex: This is new too. Useful to avoid non-selectable entries to be selected / deselect others
            callback:  (v) => {
                const swapValue = LX.getMode() == "dark";
                LX.switchMode();
                // LX.setMode( swapValue ? "light" : "dark" );
            }
        });
        // m.add( "TÀNDEM", { callback: () => {} } );      
    };
    const sidebarOptions = { 
        /* collapseToIcons: false, skipFooter: true, skipHeader: true,*/
        filter: false,
        headerTitle: "ANIMICS",
        // headerSubtitle: LX.version,
        headerImage: "./data/imgs/animics_monster.png",
        // header: customHeader,
        footerTitle: "TÀNDEM",
        // footerSubtitle: "alexroco.30@gmail.com",
        footerImage: "./data/imgs/tandem_monster.png",
        // footer: customFooter,
        onHeaderPressed: (e) => { console.log( "onHeaderPressed" ) }, 
        onFooterPressed: (e, element) => {
            new LX.DropdownMenu( element, [
               "Pages",
                { name: "Main", callback: () => { window.open("https://animics.gti.upf.edu/") } },
                { name: "Animics", callback: () => { window.open("https://animics.gti.upf.edu/") } },
                { name: "Performs", callback: () => { window.open("https://performs.gti.upf.edu/") } },
                null,
                {
                    name: "Social Media", submenu: [
                        { name: "Github", icon: "Github@solid", callback: () => { window.open("https://github.com/upf-gti/") } },
                        { name: "Twitter", icon: "X-Twitter",  callback: () => { window.open("https://x.com/gti_upf/") }  },
                        { name: "Discord", icon: "Discord",  callback: () => { window.open("https://discord.gg/9YGrGjnycj") }  }
                    ]
                }
            ], { side: "right", align: "end" });
        },
        collapsed: false,
        collapsable: false,
        displaySelected: true
    };


    let sidebar2 = null;
    if( mobile )
    {
        menubar = area.addMenubar();

        const sheetArea = new LX.Area({ skipAppend: true });
        sheetArea.addSidebar( sidebarCallback, sidebarOptions );

        menubar.addButtons([
            {
                title: "Menu",
                icon: "PanelLeft",
                callback: (value, event) => {
                    window.__currentSheet = new LX.Sheet("256px", [ sheetArea ] );
                }
            }], { float: "left" })
    }
    else
    {
        const sidebar1 = area.addSidebar( sidebarCallback, sidebarOptions );
        menubar = sidebar1.siblingArea.addMenubar();
    }


    return sidebar2;
}

function createHome( content ) {

    const mainContent = LX.makeContainer( ["100%", "calc(100% - 38px)"], "main-content bg-secondary flex flex-col items-center py-6 rounded-lg overflow-y-auto", "", content );
    mainContent.id = "home-container";

    const padContainer = LX.makeContainer( ["100%", "auto"], "px-6", "", mainContent );
    const headerContent = LX.makeContainer( ["100%", "auto"], "flex flex-row gap-10 p-4 my-6 overflow-scroll", "", padContainer );
    headerContent.style.minHeight = "256px";
    
    const _makeProjectOptionItem = ( icon, innerText, outerText, id, parent ) => {
        const item = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-3 p-3 text-md rounded-lg hover:bg-accent cursor-pointer", ``, parent );
        LX.makeContainer( ["200px", "auto"], "flex flex-col py-6 justify-center items-center content-center rounded-lg gap-3 card-button", `
            ${LX.makeIcon(icon, {svgClass:"xxxl text-foreground"}).innerHTML}
            <p class="text-sm text-center px-4 text-tertiary ">${ innerText }</p>
        `, item );
        LX.makeContainer( ["auto", "auto"], "", `<p>${ outerText }</p>`, item );
        item.id = id;
    };

    const keyframeContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Keyframe Animation", keyframeContent );
    const keyframeItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", keyframeContent );
    
    _makeProjectOptionItem( "PlusCircle@solid", "Create from scratch", "Empty project", "keyframe-project", keyframeItems );
    _makeProjectOptionItem( "ClapperboardClosed@solid", "Upload video/s", "From video/s", "video-project", keyframeItems );
    _makeProjectOptionItem( "Camera@solid", "Record yourself", "Real-time capture", "webcam-project", keyframeItems );
    LX.makeContainer(["2px", "auto"], "flex", '<span style="width: 2px;background-color: var(--color-info);filter: blur(1px);margin: 100px 0px;"></span>', headerContent);

    const scriptContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Script Animation", scriptContent );
    const scriptItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", scriptContent );

    _makeProjectOptionItem( "PlusCircle@solid", "Create from scratch", "Empty project", "script-project", scriptItems );
    LX.makeContainer(["2px", "auto"], "flex", '<span style="width: 2px;background-color: var(--color-info);filter: blur(1px);margin: 100px 0px;"></span>', headerContent);
    
    const fileContent = LX.makeContainer( ["auto", "auto"], "flex flex-col", "", headerContent );
    LX.makeContainer( ["auto", "auto"], "p-2 font-bold", "Edit Animation", fileContent );
    const fileItems = LX.makeContainer( ["auto", "auto"], "flex flex-row p-2", "", fileContent );

    _makeProjectOptionItem( "FolderOpen@solid", "Upload .bvh, .bvhe, .bml, .sigml or .json file/s", "Drop file/s", "import", fileItems );

    const projectsContent = LX.makeContainer( ["100%", "auto"], "flex flex-col gap-4 my-6 p-4", "", padContainer );
    LX.makeContainer( ["auto", "auto"], "font-bold", "Animations", projectsContent );
    const projectItems = LX.makeContainer( ["100%", "auto"], "grid gap-4 p-4 overflow-y-auto overflow-x-hidden ", "", projectsContent );
    projectItems.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
    projectItems.id = "project-items-container";

    const projectText = LX.makeContainer( ["auto", "auto"],"text-md text-foreground", "<p> Login to see your last animations. </p>", projectsContent);
    projectText.id = "project-text";

    return mainContent;
}

function createAbout( content ) {
    const mainContent = LX.makeContainer( ["100%", "calc(100% - 38px)"], "main-content bg-secondary flex flex-col items-center py-6 rounded-lg hidden", "", content );
    mainContent.id = "about-container";
    
    const swapValue = LX.getMode() == "dark";

    const headerContent = LX.makeContainer( ["auto", "25%"], "flex flex-row gap-4 my-5 p-10 overflow-scroll items-end justify-center",`<img id="animics-img" class="${mobile? "w-screen" : "h-full"}" src="data/imgs/logos/animics_${(swapValue ? "white" : "black")}.png">` , mainContent );
    
    const container = LX.makeContainer( ["100%", "calc(100% - 25%)"], "flex flex-col overflow-scroll items-center",'' , mainContent );
    
    const infoContainer = LX.makeContainer( ["100%", "auto"], "flex flex-col items-center py-10",'' , container );
    infoContainer.style.background = "linear-gradient(0deg, var(--global-color-primary), transparent)";

    const textContent = LX.makeContainer( [`${mobile? "auto" : "30%"}`, "auto"], `flex justify-center ${mobile? "w-screen" : ""}`,`<p class="text-2xl font-light text-center p-5" >Animics is an online application to create and
    edit animations for 3D humanoid characters,
    focused in Sign Language synthesis.</p>` , infoContainer );

    const techContent = LX.makeContainer(["40%", "auto"], "flex flex-col items-center gap-4 my-10 text-foreground font-bold", "" , infoContainer);
    const techText = LX.makeContainer(["auto","auto"], "py-6", `<p>Developed using</p>`, techContent);

    const techLinksContent = LX.makeContainer(["auto", "auto"], `flex ${mobile? "flex-col" : "flex-row"} justify-center items-center gap-12`, `
    <a class="h-full" href="https://chuoling.github.io/mediapipe/"><img class="hover:scale" style="height:60px; filter:grayscale(1) invert(0.5) brightness(1);" src="https://images.viblo.asia/d70d57f3-6756-47cd-a942-249cc1a7da82.png" alt="Mediapipe"></a>
    <a class="h-full" href="https://threejs.org/"><img class="hover:scale" style="height:60px;filter:invert(0.5);" src="https://needle.tools/_nuxt/logo-three.CiaNm32y.png" alt="Threejs"></a>
    <a class="h-full" href="https://github.com/jxarco/lexgui.js"><img class="hover:scale" style="height:60px; filter:grayscale(1) invert(0.5) brightness(1);" src="data/imgs/logos/lexgui.png" alt="Lexgui"></a>`, techContent)

    const fundingContent = LX.makeContainer(["40%", "auto"], "flex flex-col items-center gap-4 my-10 text-foreground font-bold", "" , infoContainer);
    const fundingText = LX.makeContainer(["auto","auto"], "py-6", `<p>Funded by</p>`, fundingContent);
    const linksContent = LX.makeContainer(["auto", "auto"], "flex flex-row justify-center gap-12", `
    <a class="h-full" href="https://signon-project.eu/"><img class="hover:scale" style="height:80px; filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/logos/marco_SignON.png" alt="SignON"></a>
    <a class="h-full" href="https://www.upf.edu/web/emerald"><img class="hover:scale" style="height:80px; filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/logos/marco_EMERALD.png" alt="EMERALD"></a>
    <a class="h-full" href="https://www.upf.edu/web/gti"><img class="py-5 hover:scale" style="height:80px; filter:grayscale(1) invert(1) brightness(0.8);" src="./data/imgs/logos/GTIlogo.png" alt="UPF-GTI"></a>`, fundingContent);

    const devContent = LX.makeContainer(["100%", "auto"], "flex flex-col items-center py-10 bg-primary font-bold", "<h3>Implemented by</h3>" , container);
    const peopleItems = LX.makeContainer( ["100%", "auto"], "flex flex-row gap-4 my-5 p-10 overflow-scroll items-end justify-center",'' , devContent );

    _makePersonItem({name: "Víctor Ubieto Nogales", img: "https://www.upf.edu/documents/115100603/264407312/Victor_cropped.jpg/dd5ee7db-580d-c51c-b499-bbbacbbfbb9e?t=1679569197124", avatar:"./docs/imgs/RPM_Victor.png", email: "victoremilio.ubieto@upf.edu", url:"https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/victor-ubieto-nogales/maximized"}, peopleItems);
    _makePersonItem({name: "Eva Valls Garolera", img: "https://www.upf.edu/documents/115100603/264407312/unnamed.png/9e17f242-5800-b95d-af77-dd03dbc91b7d?t=1679568161101", avatar:"./docs/imgs/RPM_Eva.png", email: "eva.valls@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/eva-valls-garolera/maximized"}, peopleItems);
    _makePersonItem({name: "Jaume Pozo Prades", img: "https://www.upf.edu/image/user_portrait?img_id=183376073&img_id_token=CykVYRbgc1iuesVtnp88oTFB8UA%3D&t=1745944004158", avatar:"./docs/imgs/RPM_Jaume.png", email: "jaume.pozo@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/jaume-pozo-prades/maximized"}, peopleItems);
    _makePersonItem({name: "Carol Del Corral Farrarós", img: "https://www.upf.edu/documents/115100603/264407312/DSCN1914-2.jpg/8d97985d-5e38-0a41-e730-aa2444146fed?t=1679568714469", avatar:"./docs/imgs/RPM_Carol.png", email: "carolina.delcorral@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/carolina-del-corral/maximized"}, peopleItems);
    _makePersonItem({name: "Alex Rodríguez Corrales", img: "https://www.upf.edu/documents/115100603/0/foto_orla.png/dff9a88c-b762-1f33-466c-c2c1fdd5f07e?t=1680027958307", avatar:"./docs/imgs/RPM_Alex.png", email: "alejandro.rodriguez@upf.edu", url: "https://www.upf.edu/web/gti/people/-/asset_publisher/PrrUzDqdWrKt/content/rodriguez-corrales-alejandro/maximized"}, peopleItems);
    
    return mainContent;
}

function _makeProjectItem( item ) {
    const projectText = document.getElementById("project-text");
    const projectItems = document.getElementById("project-items-container");
    projectText.classList.add("hidden");
    
    let extension = item.filename.split('.');
    extension = extension[extension.length - 1];

    let color = "--color-info";
    switch(extension) {
        case "bml": case "sigml":
            color = "--color-success";
            break;
        case "glb":
            color = "--color-accent";
            break;
    }
    let div = `<div class="rounded-xl w-full flex justify-center items-center overflow-hidden justify-center hover:scale" style="min-height: 130px;background: var(--background-blur);">
       <p class="text-2xl font-extrabold text-foreground" style="text-shadow: 1px 1px 0px var(${color});">.${extension.toUpperCase()}</p>
    </div>`
   if( item.img ) {
       div = `<img class="w-full hover:scale" style="object-fit:cover" src="${ item.img || "./docs/imgs/editStation.png"} ">`               
   }
    const itemContainer = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-4 p-4 text-md rounded-xl hover:bg-accent hover:scale cursor-pointer", `
    <div class="rounded-xl w-full overflow-hidden justify-center" style="height:130px;">
       ${div}
    </div>
    <div class="flex flex-row justify-between px-1">
        <div class="flex flex-col gap-0.5">
            <p>${ item.filename }</p>
            <p class="text-sm text-tertiary">Last modified ${ item.timestamp }</p>
        </div>
        <a class="px-2 py-1 rounded-lg lexicon fa-solid fa-ellipsis-vertical"></a>
    </div>
    `, projectItems );
    itemContainer.addEventListener( "click", () => {
        onLoadFiles([{name: item.filename, fullpath: item.fullpath, type: "application/json"}]);
    })
    const optionsIcon = itemContainer.querySelector( ".lexicon" );
    LX.listen( optionsIcon, "click", () => {
        new LX.DropdownMenu( optionsIcon, [
            { name: "Duplicate", icon: "Copy", callback: () => {} },
            null,
            { name: "Delete", icon: "Trash2" }
        ], { side: "bottom", align: "start" });
    } );

}

function _makePersonItem( item, container ) {
    
    const itemContainer = LX.makeContainer( ["auto", "auto"], "flex flex-col gap-4 p-4 text-md rounded-xl hover:bg-accent cursor-pointer", `
    <div class="rounded-xl w-full overflow-hidden card">
        <div class="card-inner">
            <div class="card-front">
                <img class="w-full hover:scale" style="object-fit:cover" src="${ item.avatar || "./docs/imgs/editStation.png"} ">
            </div>
            <div class="card-back">
                <img class="w-full img-top" style="object-fit:cover" src="${ item.img || "./docs/imgs/editStation.png"} ">
            </div>
        </div>
    </div>
    <div class="flex flex-row justify-center px-1">
        <div class="flex flex-col items-center gap-0.5">
            <p>${ item.name }</p>
            <p class="text-sm text-tertiary"> ${ item.email }</p>
        </div>
    </div>
    `, container );

    LX.listen( itemContainer, "click", () => {
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
    footerCreditsSocials.innerHTML = `<img src="data/imgs/logos/GTIlogo.png" width="150px" style="filter:invert(0.5)" draggable="false">` + footerCreditsSocials.innerHTML;
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
        input.multiple = true;
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
        input.multiple = true;
        input.click();
        input.onchange = (event) => { 
            onLoadFiles( event.currentTarget.files);
            // startAnimics({pendingResources: event.currentTarget.files})
        };
    });

    // Drag and Drop
    const body = area.root;

    window.ondragenter = ( event ) => {

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

    window.ondrop = (event) => {
        dropOver.classList.add("hidden");
        event.preventDefault();
        event.stopPropagation();
        if ( onLoadFiles( event.dataTransfer.files ) ){
            window.ondrop = null;
        }
    };

}

function unbindEvents() {
    window.ondragenter = null;
    window.ondragleave = null;
    window.ondrop = null;
}

function startAnimics(settings) {
    unbindEvents();
    const loadingAnim = UTILS.makeLoading("Starting Animics");
    loadingAnim.onfinish = () => {
        // Manually resetting lexgui
        LX.root.innerHTML = "";
        LX.mainArea = new LX.Area( { id: 'mainarea' } );
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
    
    const animExtensions = ['bvh','bvhe', 'glb', 'json'];
    const scriptExtensions = ['bml', 'sigml'];

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
        
    alert("Format not supported.\n\nFormats accepted:\n\tVideo: 'webm','mp4','ogv','avi'\n\tScript animation: 'bml', 'sigml'\n\tKeyframe animation: 'bvh', 'bvhe', 'json'");
    return null;
}

function _checkSession() {

    const signupButton = document.getElementById("signup-button");
    const loginButton = document.getElementById("login-button");
    const userButton = document.getElementById("user-button");

    if(!animics.fileSystem.session || !animics.fileSystem.session.user || animics.fileSystem.session.user.username == "guest") {
        signupButton.classList.remove("hidden");
        loginButton.classList.remove("hidden");
        userButton.classList.add("hidden");
        const projectsContent = document.getElementById("project-items-container");
        if(projectsContent) {
            projectsContent.innerHTML = "";
            const projectText = document.getElementById("project-text");
            projectText.classList.remove("hidden");
        }
        offset=0;
        limit = 10;
    }
    else {
        signupButton.classList.add("hidden");
        loginButton.classList.add("hidden");
        userButton.classList.remove("hidden");
        userButton.innerHTML = animics.fileSystem.session.user.username;
        appendAnimationFiles();
    }
}

function appendAnimationFiles( refresh = false) {

    animics.fileSystem.session.getLastFiles(limit, offset, (files) => {
        const projectItems = document.getElementById("project-items-container");
        if(projectItems && projectItems.lastChild) {
            projectItems.lastChild.remove();
            if(refresh) {
                projectItems.innerHTML = "";
            }
        }

        const projectText = document.getElementById("project-text");
        projectText.classList.add("hidden");

        files = files ?? [];
        for(const data of files) {            
            _makeProjectItem( data );
        }

        if(files.length >= limit) {
            const itemContainer = LX.makeContainer( ["auto", "162px"], "flex flex-col gap-4 p-4 text-md rounded-xl justify-center items-center", ``, projectItems);
            const loadMoreButton = LX.makeContainer( ["60%", "80px"], "text-md font-medium rounded-lg p-2 bg-primary text-white hover:scale self-center content-center text-center cursor-pointer select-none flex flex-col items-center justify-center", `${LX.makeIcon("MoreHorizontal", {svgClass:"xxl text-white"}).innerHTML} <p class="text-lg">LOAD MORE</p>`, itemContainer );
            loadMoreButton.tabIndex = "1";
            loadMoreButton.role = "button";
            LX.listen( loadMoreButton, "click", () => { offset+=10;_checkSession()} );			
            loadMoreButton.id = "loadmore-button";
        }
    })
}