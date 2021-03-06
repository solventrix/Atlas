define(
    [
        'knockout',
        'text!./export-button.html',
        'appConfig',
        'atlas-state',
        'services/JobDetailsService',
        'services/AuthAPI',
        'databindings'],
    function (ko, view, config, sharedState, jobDetailsService, authApi) {

        const resultKeys=['cohort',
            'cohortInclusion',
            'cohortInclusionResult',
            'cohortInclusionStats',
            'cohortSummaryStats',
            'cohortGenerationInfo',
            'cohortFeatures',
            'cohortFeaturesAnalysisRef',
            'cohortFeaturesDist',
            'cohortFeaturesRef']

        function createJob(params) {
            var job = params.job;
            if (job) {
                job().status('RUNNING');
                
                console.log("export job");
                jobDetailsService.createJob(params);
            //    sharedState.jobListing.queue(job());
            }
            return job;
        }

        function setJob(job, status){
            job().status(status);
            sharedState.jobListing.queue(job());
        }

        function exportButton(params) {
            var self = this;

            if(params.dropup) {
                self.dropup = params.dropup();
            } else {
                self.dropup = false;
            }
            self.multiSelect = params.multiSelect;
            self.endpoint = params.endpoint;
            self.exporting = ko.observable(false);
            self.disabled = params.disabled;

            self.exportToFile = function () {
                const endpoint = params.endpoint();
                self.exporting(true);

                $.ajax(endpoint, {
                    success: function (response, status, headers) {
                        var file = new Blob([JSON.stringify(response)]);

                        var isResultsResponse = Object.keys(response).every((value) => resultKeys.indexOf(value)>=0);

                        var filename = "cohort-definition." + (isResultsResponse ? "results" : "cohort");
                        // Get the filename from the header
                        var contentDispositionHeader = headers.getResponseHeader("content-disposition");
                        if(contentDispositionHeader != null) {
                            var filenameIndex = contentDispositionHeader.indexOf("=");
                            if(filenameIndex != null) {
                                filename = contentDispositionHeader.substr(filenameIndex + 1);
                                // remove double quotes around the filename
                                filename = filename.slice(1, -1);
                            }
                        }
                        console.debug('filename: ' + filename);

                        // Download the file
                        const data = window.URL.createObjectURL(file);
                        var link = document.createElement('a');
                        link.href = data;
                        link.download=filename;
                        document.body.appendChild(link);
                        link.click();
                        setTimeout(function() {
                            // For Firefox it is necessary to delay revoking the ObjectURL
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(data); }, 100);

                    }
                }).always(function(){
                    self.exporting(false);
                });
            };

            self.exportToCloud = function () {

                const endpoint = params.endpoint() + "?toCloud=true";
                self.exporting(true);
                var refreshPromise = null;
                var res = null;

                //var job = createJob(params);

                $.ajax(endpoint, {
                    success: function (response, status, headers) {
                        if (config.userAuthenticationEnabled) {
                            refreshPromise = authApi.loadUserInfo();
                        }
                        res = response;
                        //if (job) {
                        //    setJob(job, 'COMPLETE')
                        //}
                    },
                    error: function (err) {
                        //if (job) {
                        //    setJob(job, 'ERROR')
                        //}
                    }
                }).always(function(){
                    if(refreshPromise === null){
                        self.exporting(false);
                    } else {
                        refreshPromise.then(function () {
                            self.exporting(false);
                            if(params.callbackURL && res){
                                window.location = params.callbackURL(res);
                            }
                        })
                    }
                });
            }
        }


        var component = {
            viewModel: exportButton,
            template: view
        };

        ko.components.register('export-button', component);
        return component;
    });