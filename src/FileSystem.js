import { LFS } from './libs/litefileserver.js';

class FileSystem {
    
    constructor( callback ) {
        this.session = null;
        this.parsers = {};
        this.host = "https://signon-lfs.gti.sb.upf.edu/";
        this.root = this.host + "/files/";
        this.ALLOW_GUEST_UPLOADS = false;

        // init server this.onReady.bind(this, user, pass, (s) => {this.session = s; callback;})
        LFS.setup(this.host + "src/", () => {

            LFS.checkExistingSession(callback);
        });
    }
   
    init() {
      console.log(this);
    }

    getSession() {
        return this.session;
    }

	setSession(session)
	{
		if(!session || !session.status)
			session = null;

		if(session && this.session && session.user.username === this.session.user.username)
			return;

		this.session = session;
		this.user = session ? session.user : null;
		//this.updateLoginArea();
		// if( session && session.user && session.user.username == "guest" && this.preferences.show_guest_warning )
		// 	this.showGuestWarning();
	}

    createAccount(user, password, email, on_complete, on_error, admin_token, userdata) {
       LFS.createAccount( user, password, email, on_complete, on_error, admin_token, userdata )
    }

	login(username, password, callback)
	{
        username = username || this.user;
        password = password || this.pass;
		if(!username || !password)
			return;

		const inner_success = (session, response, resolve) =>
		{
            if(response.status == 1)
			    this.setSession(session);
            
            if(resolve)
                resolve(session);
			if(callback)
				callback(this.session, response);
		}

		const inner_error = (err) =>
		{
			throw err;
		}
        return new Promise(resolve => LFS.login(username, password, (s,r) => inner_success(s,r,resolve), inner_error));

	}

    logout(callback) {
        this.session.logout(()=> {
            console.log("Logout done");
            this.session = null;
            if(callback)
                callback();
        });
    }

    onReady(u, p, callback) {
        // log the user login: function( username, password, on_complete)
        LFS.login(u, p, callback);
    }

    onLogin( callback, session, req ){

        if(!session)
            throw("error in server login");

        if(req.status == -1) // Error in login
        {
            console.error(req.msg);
        }
        else
        {
            this.session = session;
            console.log("%cLOGGED " + session.user.username, "color: #7676cc; font-size: 16px" );
        }

        if(callback)
        callback(req.status != -1, req.msg);
    }

    onLogout( callback, closed ){

        if(closed)
        {
            this.session = null;
            console.log("%cLOGGED OUT","color: #7676cc; font-size: 16px" );
            if(callback)
                callback();    
        }
    }
    
    async uploadFile(path, file, metadata){


        return new Promise((resolve, reject) => {

            var session = this.session;
            // var unit_name = session.user.username;
            // let path = unit_name + "/" + folder + "/" + file.name;

			session.uploadFile( path, file, 
                    { "metadata": metadata }, 
                    function(e){console.log("complete",e); resolve()},
                    function(e, req){console.error("error",e, req);},
            );
        });
                //                    e => console.log("progress",e));
    }

    async uploadData(folder, data, filename, metadata){


        return new Promise((resolve, reject) => {

            var session = this.session;
            let path = session.user.username + "/" + folder + "/" + filename;

			session.uploadFile( path, data, 
                    { "metadata": metadata }, 
                    function(e){console.log("complete",e); resolve()},
                    e => console.log("error",e)); //,
//                    e => console.log("progress",e));
        });
    }

    async getFiles( unit, folder ){
        return new Promise( (resolve, reject)=>{
        
            function onError(e){
                reject(e);
            }
    
            function onFiles(f){
                // if(!f)
                //     return onError("Error: folder \""+folder+"\" not found.");
                resolve(f);
            }

            var session = this.session;

            session.request( 
                session.server_url,
                { action: "files/getFilesInFolder", unit: unit, folder: folder }, function(resp){

                if(resp.status < 1){
                    onError(resp.msg);
                    return;
                }
                //resp.data = JSON.parse(resp.data);
                LFS.Session.processFileList( resp.data, unit + "/" + folder );
                onFiles(resp.data, resp);
            });
        });
    }

    async getFolders( onFolders ){
        var session = this.session;

        session.getUnitsAndFolders(onFolders);

    }

    createFolder ( fullpath, on_complete, on_error )
    {
        if(!fullpath)
            throw("no fullpath specified");

        var session = this.session;

        session.createFolder ( fullpath, on_complete, on_error );
        
    }
}

export { FileSystem };