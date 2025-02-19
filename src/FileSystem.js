import { LFS } from './libs/litefileserver.js';

class RemoteFileSystem {
    
    constructor( callback ) {
        this.session = null;

        this.host = "https://signon-lfs.gti.sb.upf.edu/";
        this.root = this.host + "files/";
        
        this.repository = {signs:[], presets: [], clips: []};
        this.refreshRepository = true;

        // init server this.onReady.bind(this, user, pass, (s) => {this.session = s; callback;})
        LFS.setup(this.host + "src/", () => {
            LFS.checkExistingSession( (session ) => {
                this._setSession( session );
                if( session ) {
                    this.loadUnits();
                }
                callback( this.session );
            }); 
        });        
    }
    
    _setSession( session ) {
        if( !session || !session.status ) {
            session = null;
        }

        if( session && this.session && session.user.username === this.session.user.username ) {
            return;
        }

        this.session = session;
    }

    getSession() {
        return this.session;
    }

    createAccount( user, password, email, on_complete, on_error ) {
        LFS.createAccount( user, password, email, ( valid, request ) => {
            if( !valid ) {
                if( on_error ) {
                    on_error( request );
                }
                return;
            }

            this.login(user, pass, () => {
                this.loadUnits();
            
                this.createFolders();
                    
                if(on_complete) {
                    on_complete(request);
                }
            })
        }, on_error, null, null );
    }

	login( username, password, callback ) {
		if( !username || !password ) {
			return;
        }

		const inner_success = (session, response, resolve) => {
            if( response.status == 1 ) {
			    this._setSession( session );
            }
            
            if( resolve ) {
                resolve(session);
            }

			if( callback ) {
				callback(this.session, response);
            }
		}

		const inner_error = (err) => {
			throw err;
		}

        const promise = new Promise(resolve => {
            LFS.login(username, password, (s,r) => inner_success(s,r,resolve), inner_error)
        });

        return promise;
	}

    logout( callback ) {

        this.session.logout( () => {
            console.log("Logout done");
            this.session = null;
            
            const repo = {signs:[], presets: [], clips: []};

            // Only leave local and public remote files in the repo. Remove the ones from the server
            for( let folder in this.repository ) {
                for( let i = 0; i < this.repository[folder].length; i++ ) {
                    if( this.repository[folder][i].id == "Local" || this.repository[folder][i].id == "Public" ) {
                        repo[folder].push(this.repository[folder][i]);
                    }
                }
            }
            this.repository = repo;

            if( callback ) {
                callback();
            }
        });
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

    getFiles( unit, folder, on_complete, on_error ) {
        if( !this.session ) {
            on_error();
        }
        this.session.getFiles( unit, folder, on_complete, on_error );
    }

    // async getFolders( onFolders ) {
    //     const session = this.session;
    //     session.getUnitsAndFolders(onFolders);
    // }

    createFolders() {
        const session = this.session;
        if( !session ) {
            return;
        }

        session.createFolder( session.user.username + "/animics/presets/", (v, r) => {console.log(v)} );
        session.createFolder( session.user.username + "/animics/signs/", (v, r) => {console.log(v)} );
        session.createFolder( session.user.username + "/animics/clips/", (v, r) => {console.log(v)} );
    }

    loadUnits() {
        const session = this.session;
        this.repository = {signs:[], presets: [], clips: []};
        
        session.getUnits( (units) => {
            for( let i = 0; i < units.length; i++ ) {
                if(units[i].name == "guest") {
                    continue;
                }
                const data = {
                    id: units[i].name,
                    type: "folder",
                    unit: units[i].name,
                    children: []
                };
                
                this.repository.signs.push( Object.assign( {}, data ) );
                this.repository.presets.push( Object.assign( {}, data ) );
                this.repository.clips.push( Object.assign( {}, data ) );
            }
        });
    }

    //Get folders from each user unit
    async loadFolders( folder , callback) {
        const session = this.session;
        let count = 0;
        for( let i = 0; i < this.repository[ folder ].length; i++ ) {

            const unit = this.repository[ folder ][i].id;
            const variable = "refresh" + ( folder  == "signs" ? "Signs" : "Presets") + "Repository";
            //get all folders for empty units
            if( !(unit == "Local" || this.repository[ folder ][i].children.length) || this[variable] && unit == session.user.username ) {

                await session.getFolders( unit, async ( folders ) =>  {
                    const mainFolder = folders.animics[ folder ];
                    const assets = [];
                    if( mainFolder ) {
                        for( let folder in mainFolder ) {
                            assets.push({id: folder, type: "folder", folder: folder , children: [], unit: unit})
                        }
                    }

                    this.repository[ folder ][i].children = assets;
                    count++;
                    
                    if( this.repository[ folder ].length == count ) {
                        if( callback ) {
                            callback();
                        }
                    }
                })
                
            }
            else {
                if( unit == "Local" ) {
                    this.repository[ folder ][i] = this.localStorage[ folder ];
                }

                count++;
                if( this.repository[ folder ].length == count ) {
                    if(callback) {
                        callback();
                    }
                }
            }
        }        
    }

    async loadAllUnitsFolders( folder, callback ) {
        const session = this.session;
        const units_number = Object.keys(session.units).length;
        let count = 0;

        for( let unit in session.units ) {
            //get all folders for empty units
            await session.getFolders( unit, async ( folders ) =>  {
                const mainFolder = folders.animics[ folder ];
                const assets = [];
                if( mainFolder ) {
                    for( let folder in mainFolder ) {
                        const data = {id: folder, type: "folder", folder:  folder , children: [], unit: unit};
                        assets.push( data );
                    }
                }
                const data = {id: unit, type:"folder",  children: assets, unit: unit};
                this.repository[ folder ].push( data);
                count++;

                if( units_number == count ) {
                    this.repository[ folder ].push(this.localStorage[ folder ]);
                    
                    if( callback ) {
                        callback();
                    }
                }
            })
        }
    }
}

export { RemoteFileSystem };