import { LFS } from './libs/litefileserver.js';

class RemoteFileSystem {
    
    constructor( callback, folders = []) {
        this.session = null;

        this.host = "https://signon-lfs.gti.upf.edu/";
        this.root = this.host + "files/";
        
        // this.repository = {signs:[], presets: [], clips:[]};
        this.repository = [];

        this.refreshRepository = true;

        // init server this.onReady.bind(this, user, pass, (s) => {this.session = s; callback;})
        LFS.setup(this.host + "src/", () => {
            LFS.checkExistingSession( (session ) => {
                this._setSession( session );
                // if( session ) {
                //     this.loadAllUnitsFolders( () => callback( this.session ), folders );
                // }
                // else {
                    callback( this.session );
                // }
                
            }, (error) => callback(error)); 
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

		const inner_error = (err, resolve) => {
            if( resolve ) {
                resolve(null);
            }

			if( callback ) {
				callback(null, err);
            }
			throw err;
		}

        const promise = new Promise(resolve => {
            LFS.login(username, password, (s,r) => inner_success(s,r,resolve), (err) => inner_error(err, resolve))
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
                if( folder == "Local" || folder == "Public" ) {
                    
                    repo[folder] = this.repository[folder];
                }
                // for( let i = 0; i < this.repository[folder].length; i++ ) {
                //     if( this.repository[folder][i].id == "Local" || this.repository[folder][i].id == "Public" ) {
                //     }
                // }
            }
            this.repository = repo;

            if( callback ) {
                callback();
            }
        });
    }

    async uploadFile(folder, filename, data, metadata){


        return new Promise((resolve, reject) => {

            const session = this.session;
            const unit = session.user.username;
            const path = unit + "/" + folder + "/" + filename;

            session.uploadFile( path, data, { "metadata": metadata }, 
                (e) => {
                    console.log("complete", e);
                    this.getFiles( unit, folder, (files) => {
                        const files_data = [];
                        if( files ) {                                        
                            for( let f = 0; f < files.length; f++ ) {
                                let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                                files[f].id = files[f].filename;
                                files[f].folder = folder.replace("animics/", "");
                                files[f].type = extension;
                                if(files[f].type == "txt")
                                    continue;
                                files_data.push(files[f]);
                            }
                        }
                        resolve( files_data );
                    },
                    (err) => {
                        console.error(err);
                        resolve( false );
                    } );
                },
                (e) => {
                    console.log("error", e);
                    reject(e);
                }
            );
        });
                //                    e => console.log("progress",e));
    }

    async uploadData(folder, data, filename, metadata){

        return new Promise((resolve, reject) => {

            var session = this.session;
            let path = session.user.username + "/" + folder + "/" + filename;

			session.uploadFile( path, data, { "metadata": metadata }, 
                (e) => {
                    console.log("complete", e);
                    this.getFiles( unit, folder, (files) => {
                        const files_data = [];
                        if( files ) {                                        
                            for( let f = 0; f < files.length; f++ ) {
                                files[f].id = files[f].filename;
                                files[f].folder = folder.replace("animics/", "");
                                files[f].type = UTILS.getExtension(files[f].filename);
                                if(files[f].type == "txt")
                                    continue;
                                files_data.push(files[f]);
                            }
                        }
                        resolve( files_data );
                    },
                    (err) => {
                        console.error(err);
                        resolve( false );
                    } );
                },
                (e) => {
                    console.log("error", e);
                    reject(e);
                }
            );
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

    async loadUnits() {
        // this.repository = {signs:[], presets: [], clips: []};
        this.repository = [];
        const session = this.session;
        if( !session ) {
            return;
        }
        return new Promise( resolve => {
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
    
                    this.repository.push( data );
                    // this.repository.signs.push( Object.assign( {}, data ) );
                    // this.repository.presets.push( Object.assign( {}, data ) );
                    // this.repository.clips.push( Object.assign( {}, data ) );
                }
                resolve();
            });
        })
        
    }

    //Get folders from each user unit
    async loadFolders( folder , callback) {
        const session = this.session;
        let count = 0;
        for( let i = 0; i < this.repository.length; i++ ) {

            const unit = this.repository[i].id;
            const variable = "refresh" + ( folder  == "signs" ? "Signs" : "Presets") + "Repository";
            //get all folders for empty units
            if( !(unit == "Local" || this.repository[i].children.length) || this[variable] && unit == session.user.username ) {

                await session.getFolders( unit, async ( folders ) =>  {
                    const mainFolder = folders.animics[ folder ];
                    const assets = [];
                    if( mainFolder ) {
                        for( let folder in mainFolder ) {
                            assets.push({id: folder, type: "folder", folder: folder , children: [], unit: unit})
                        }
                    }
                    else if( folders.animics.hasOwnProperty( folder ) ) {
                        assets.push({id: folder, type: "folder", folder: folder , children: [], unit: unit})
                    }

                    this.repository[i].children = assets;
                    count++;
                    
                    if( this.repository.length == count ) {
                        if( callback ) {
                            callback();
                        }
                    }
                })
                
            }
            else {
                // if( unit == "Local" ) {
                //     this.repository[i] = this.localStorage[ folder ];
                // }

                count++;
                if( this.repository[i].length == count ) {
                    if(callback) {
                        callback();
                    }
                }
            }
        }        
    }

    async loadAllUnitsFolders( callback, allowFolders = [] ) {
        await this.loadUnits();
        const session = this.session;
        if( !session ) {
            callback();
            return;
        }

        let count = 0;

        for( let i = 0; i < this.repository.length; i++ ) {
            const unit = this.repository[i].id;
            //get all folders for empty units
            await session.getFolders( unit, async ( folders ) =>  {
                const foldersData = [];
                for( let folder in folders.animics ) {
                    if( allowFolders.length && allowFolders.indexOf(folder) < 0 ) {
                        continue;
                    }
                    const assets = [];
                    const mainFolder = folders.animics[ folder ];
                    if( mainFolder ) {
                        for( let folderc in mainFolder ) {
                            const data = {id: folderc, type: "folder", folder:  folderc , children: [], unit: unit, fullpath: "animics/"+ folder + "/" + folderc};                            
                            assets.push( data );
                        }
                    }
                    const folderData = {id: folder, type: "folder", folder: folder , children: assets, unit: unit, fullpath: "animics/"+ folder };
                    if( folder == "presets" ) {
                        folderData.icon = "fa fa-tags";
                    }
                    else if( folder == "signs") {
                        folderData.icon = "fa fa-hands";
                    }
                    foldersData.push( folderData )
                }
                const data = {id: unit, type: "folder", children: foldersData, unit: unit};
                this.repository[i] = data;
                count++;

                if( count == this.repository.length ) {
                    // this.repository.push(this.localStorage);
                    
                    if( callback ) {
                        callback();
                    }
                }
            })
        }
    }

    deleteFile( unit, folder, file, callback ) {
        const session = this.session;
        if( !session ) {
            if( callback ) {
                callback( false );
                return;
            }
        }

        session.deleteFile( unit + "/" + folder + "/" + file, (deleted) => {
            if( deleted ) {
                this.getFiles( unit, folder, (files) => {
                    const files_data = [];
                    if( files ) {                                        
                        for( let f = 0; f < files.length; f++ ) {
                            let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                            files[f].id = files[f].filename;
                            files[f].folder = folder.replace("animics/", "");
                            files[f].type = extension;
                            if(files[f].type == "txt")
                                continue;
                            files_data.push(files[f]);
                        }
                    }
                    callback( files_data );
                },
                (err) => {
                    console.error(err);
                    callback( false );
                } );
            }
            else {
                callback( deleted );
            }
        });
    }
}

export { RemoteFileSystem };