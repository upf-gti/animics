import { LFS } from './libs/litefileserver.js';
import { UTILS } from './Utils.js';
class RemoteFileSystem {
    
    constructor( callback, folders = []) {
        this.session = null;

        this.host = "https://dev-lfs.gti.upf.edu/";
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

            this.login(user, password, () => {
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

    // move file or rename file
    async moveFile( fullpath, new_path) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.moveFile( fullpath, new_path,
                ( e ) => {
                    resolve(true);
                }, (err) => {
                    console.error( err );
                    resolve(false);
                }
            )
         });
    }

    async getFiles( unit, folder) {
        if( !this.session ) {
            return
        }
        return new Promise((resolve, reject) => {
            this.session.getFiles( unit, folder, 
                ( files ) => {
                    resolve(files);
                }, (err) => {
                    console.error( err );
                    reject(err);
                }
            );
        });
    }

    async getFileInfo( fullpath ) {
        if( !this.session ) {
            return;
        }
        return new Promise((resolve, reject) => {
            this.session.getFileInfo( fullpath, 
                ( info ) => {
                    resolve(info);
                }, (err) => {
                    console.error( err );
                    reject(err);
                }
            );
        });
    }

    // async getFolders( onFolders ) {
    //     const session = this.session;
    //     session.getUnitsAndFolders(onFolders);
    // }

    async createFolders() {
        const session = this.session;
        if( !session ) {
            return;
        }

        await session.createFolder( session.user.username + "/animics/clips/", (v, r) => {console.log(v)} );
        await session.createFolder( session.user.username + "/animics/scripts/presets/", (v, r) => {console.log(v)} );
        await session.createFolder( session.user.username + "/animics/scripts/signs/", (v, r) => {console.log(v)} );
    }

    async createFolder( fullpath ) {
        return new Promise( (resolve, reject) => {
            const session = this.session;
            if( !session ) {
                reject( "no session" );
            }
            session.createFolder( fullpath,
                (v, r) => {
                    resolve(v);
                    console.log(v);
                },
                (err) => {
                    reject( err );
                }
            );
        })
    }

    async deleteFolder( fullpath ) {
        return new Promise( (resolve, reject) => {
            const session = this.session;
            if( !session ) {
                reject( "no session" );
            }
            session.deleteFolder( fullpath,
                (v, r) => {
                    resolve(v);
                    console.log(v, r);
                },
                (err) => {
                    reject( err );
                }
            );
        })
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
                        mode: units[i].mode,
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
    async loadFolders(unit, folder, allowFolders) {
        if( !this.session ) {
            return;
        }
        return new Promise( async (resolve, reject) => {

            await this.session.getFolders(unit, folder, async ( folders ) =>  {

                const getAssetInfo = (unitName, assets, path, allowFolders = []) => {
                    const extraData = [];
                    for( let asset in assets ) {
                        if( allowFolders.length && allowFolders.indexOf(asset) < 0) {
                            continue;
                        }
                        const data = {id: null, type: null, folder: null, children: [], unit: unitName, fullpath: path};
                        if( typeof(assets[asset]) == 'object' ) {
                            data.id = asset;
                            data.type = "folder";
                            data.folder = asset;
                            data.fullpath += "/"+asset;
                            data.children = getAssetInfo(unitName, assets[asset], data.fullpath);
                            if( asset == "presets" ) {
                                data.icon = "Tags";
                            }
                            else if( asset == "signs") {
                                data.icon = "HandsAslInterpreting";
                            }
                            else if( asset == "clips") {
                                data.icon = "ClapperboardClosed";
                            }
                        }
                        else {
                            const filename = assets[asset];
                            const type = UTILS.getExtension( filename );
                            data.id = filename;
                            data.type = type;
                            data.fullpath += "/"+filename;
                        }
                        extraData.push( data )
                    }
                    return extraData;
                }
                console.log(folders)
                const mainFolder = Object.keys(folders)[0];
                const data = getAssetInfo(unit, folders[mainFolder], folder, allowFolders);
                resolve( data );
            })
        })
    }

    async loadAssets( unit, folder, allowFolders = [] ) {
    
        const session = this.session;
        if( !session || !folder ) {
            return;
        }
        return new Promise( (resolve, reject) => {

            session.getFilesByPath( folder,
                (files) => {
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
                (err) => reject(err)
            )
        })
       
        // await session.getFoldersAndFiles( unit, folder, depth, async ( folders ) =>  {

        //     const getAssetInfo = (unit, assets, path, restrictFolders = []) => {
        //         const extraData = [];
        //         for( let asset in assets ) {
        //             if( restrictFolders.length && restrictFolders.indexOf(asset) < 0) {
        //                 continue;
        //             }
        //             const data = {id: null, type: null, folder: null, children: [], unit: unit, fullpath: path};
        //             if( typeof(assets[asset]) == 'object' ) {
        //                 data.id = asset;
        //                 data.type = "folder";
        //                 data.folder = asset;
        //                 data.fullpath += "/"+asset;
        //                 data.children = getAssetInfo(unit, assets[asset], data.fullpath);
        //                 if( asset == "presets" ) {
        //                     data.icon = "Tags";
        //                 }
        //                 else if( asset == "signs") {
        //                     data.icon = "HandsAslInterpreting";
        //                 }
        //                 else if( asset == "clips") {
        //                     data.icon = "ClapperboardClosed";
        //                 }
        //             }
        //             else {
        //                 const filename = assets[asset];
        //                 const type = UTILS.getExtension( filename );
        //                 data.id = filename;
        //                 data.type = type;
        //                 // data.lastModified = assets[asset].timestamp;
        //                 data.fullpath += "/"+filename;
        //             }
        //             extraData.push( data )
        //         }
        //         return extraData;
        //     }
        //     const data = getAssetInfo(unit, folders, folder, allowFolders);
            
        //     if( callback ) {
        //         callback( data );
        //     }
        // })
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
            const unit = this.repository[i];
            const unitName = unit.id;
            const unitMode = unit.mode;
            //get all folders for empty units
            // await session.getFolders( unit, async ( folders ) =>  {
            //     const foldersData = [];
            //     for( let folder in folders.animics ) {
            //         if( allowFolders.length && allowFolders.indexOf(folder) < 0 ) {
            //             continue;
            //         }
            //         const assets = [];
            //         const mainFolder = folders.animics[ folder ];
            //         if( mainFolder ) {
            //             for( let folderc in mainFolder ) {
            //                 const data = {id: folderc, type: "folder", folder:  folderc , children: [], unit: unit, fullpath: "animics/"+ folder + "/" + folderc};                            
            //                 assets.push( data );
            //             }
            //         }
            //         const folderData = {id: folder, type: "folder", folder: folder , children: assets, unit: unit, fullpath: "animics/"+ folder };
            //         if( folder == "presets" ) {
            //             folderData.icon = "Tags";
            //         }
            //         else if( folder == "signs") {
            //             folderData.icon = "HandsAslInterpreting";
            //         }
            //         foldersData.push( folderData )
            //     }
            //     const data = {id: unit, type: "folder", children: foldersData, unit: unit};
            //     this.repository[i] = data;
            //     count++;

            //     if( count == this.repository.length ) {
            //         // this.repository.push(this.localStorage);
                    
            //         if( callback ) {
            //             callback();
            //         }
            //     }
            // })
            await session.getFoldersTree( unitName, async ( folders ) =>  {

                const getAssetInfo = (unitName, assets, path, allowFolders = []) => {
                    const extraData = [];
                    for( let asset in assets ) {
                        if( allowFolders.length && allowFolders.indexOf(asset) < 0) {
                            continue;
                        }
                        const data = {id: null, type: null, folder: null, children: [], unit: unitName, fullpath: path, mode: unitMode};
                        if( typeof(assets[asset]) == 'object' ) {
                            data.id = asset;
                            data.type = "folder";
                            data.folder = asset;
                            data.fullpath += "/"+asset;
                            data.children = getAssetInfo(unitName, assets[asset], data.fullpath);
                            if( asset == "presets" ) {
                                data.icon = "Tags";
                            }
                            else if( asset == "signs") {
                                data.icon = "HandsAslInterpreting";
                            }
                            else if( asset == "clips") {
                                data.icon = "ClapperboardClosed";
                            }
                        }
                        else {
                            const filename = assets[asset];
                            const type = UTILS.getExtension( filename );
                            data.id = filename;
                            data.type = type;
                            data.fullpath += "/"+filename;
                        }
                        extraData.push( data )
                    }
                    return extraData;
                }
                console.log(folders)
                const extraData = {id: unitName, type: "folder", folder: null, children: [], unit: unitName, mode: unitMode};
                const data = getAssetInfo(unitName, folders.animics, unitName+"/animics", allowFolders);
                extraData.children = data;
                console.log(extraData)
                
                this.repository[i] = extraData;
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

    async loadFoldersAndFiles(unit, folder, allowFolders) {

        if( !this.session ) {
            return;
        }

        return new Promise( async (resolve, reject) => {
            const files = await this.loadAssets(unit, folder, allowFolders);
            const folders = await this.loadFolders(unit, folder, allowFolders);
            const data = [...folders, ...files];
            resolve(data);
            // await this.session.getFoldersAndFiles( unit, folder, async ( folders ) =>  {

            //     const getAssetInfo = (unit, assets, path, allowFolders = []) => {
            //         const extraData = [];
            //         for( let asset in assets ) {
            //             if( allowFolders.length && allowFolders.indexOf(asset) < 0) {
            //                 continue;
            //             }
            //             const data = {id: null, type: null, folder: null, children: [], unit: unit, fullpath: path};
            //             if( typeof(assets[asset]) == 'object' ) {
            //                 data.id = asset;
            //                 data.type = "folder";
            //                 data.folder = asset;
            //                 data.fullpath += "/"+asset;
            //                 data.children = getAssetInfo(unit, assets[asset], data.fullpath);
            //                 if( asset == "presets" ) {
            //                     data.icon = "Tags";
            //                 }
            //                 else if( asset == "signs") {
            //                     data.icon = "HandsAslInterpreting";
            //                 }
            //                 else if( asset == "clips") {
            //                     data.icon = "ClapperboardClosed";
            //                 }
            //             }
            //             else {
            //                 const filename = assets[asset];
            //                 const type = UTILS.getExtension( filename );
            //                 data.id = filename;
            //                 data.type = type;
            //                 // data.lastModified = assets[asset].timestamp;
            //                 data.fullpath += "/"+filename;
            //             }
            //             extraData.push( data )
            //         }
            //         return extraData;
            //     }
            //     const data = getAssetInfo(unit, folders, folder, allowFolders);
                
            //     resolve(data);
            // })
        })
    }

    deleteFile( fullpath ) {
        const session = this.session;
        if( !session ) {
            return;
        }

        new Promise( (resolve, reject) => {
            session.deleteFile( fullpath, 
                (deleted) => {
                    resolve( deleted );
                },
                (err) => {
                    reject( err );
                }
                // if( deleted ) {
                //     // const url = fullpath.split("/");
                //     // const unit = url[0];
                //     // url.pop();
                //     // url = url.slice(1);
                //     // const folder = url.join("/");
                //     // this.getFiles( unit, folder, (files) => {
                //     //     const files_data = [];
                //     //     if( files ) {                                        
                //     //         for( let f = 0; f < files.length; f++ ) {
                //     //             let extension = files[f].filename.substr(files[f].filename.lastIndexOf(".") + 1);
                //     //             files[f].id = files[f].filename;
                //     //             files[f].folder = folder.replace("animics/", "");
                //     //             files[f].type = extension;
                //     //             if(files[f].type == "txt")
                //     //                 continue;
                //     //             files_data.push(files[f]);
                //     //         }
                //     //     }
                //     //     callback( files_data );
                //     // },
                //     // (err) => {
                //     //     console.error(err);
                //     //     callback( false );
                //     // } );
                // }
                // else {
                //     callback( deleted );
                // }
            )})
    }
}

export { RemoteFileSystem };