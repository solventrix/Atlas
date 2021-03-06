define([
    'knockout',
    'text!./import-button.html',
    'appConfig',
    'services/AuthAPI',
    'atlas-state',
    'databindings'], function (ko, view, config, authApi, sharedState) {
    function importButton(params) {

        var self = this;

        self.model = params.model;

        self.showImportLightBox = ko.observable(false);
        self.content = ko.observable();
        self.draggedOver = ko.observable(false);
        self.config = config;
        self.name = params.name;
        self.type = params.type;
        self.importing = ko.observable(false);
        self.fileUuid = ko.observable('');
        self.disable = params.disable;
        self.loadingDefinitionsToImport = ko.observable(true);
        self.isFileSelected = ko.observable(false);

        self.currentTab = ko.observable('listTab');

        self.cohortDefinitions = ko.observableArray();

        self.breadCrumb = ko.observableArray();
        self.breadCrumbNames = ko.observableArray();

        self.job = params.job;

        self.error = ko.observable("");

        function load() {
            self.loadingDefinitionsToImport(true);
            $.ajax(params.importUrl(), {
                contentType: 'application/json',
                timeout: 20000,
                success: function (data) {
                    self.error("");
                    var elements = []

                    data.forEach(function (element) {
                        elements.push(element)
                        var next = element.previous;
                        element.dataTargets = []
                        while (next) {
                            next.parent = element.uuid;
                            element.dataTargets.push(next);
                            // elements.push(next)
                            next = next.previous;
                        }
                    })

                    self.cohortDefinitions(elements);
                },
                error: function(err) {
                    if(!config.isCentralInstance){
                        self.error(err.responseJSON.message);
                    }
                }
            }).always(function(){
                self.loadingDefinitionsToImport(false);
            });
        }

        self.cohortDefinitions.subscribe(function(elements){
            elements.sort(function(def1,def2){
                return new Date(def2.lastModified) - new Date(def1.lastModified);
            })
            var counter = elements.length;
            elements.forEach(function(cohortDefinition){
                cohortDefinition.version = counter--;
                cohortDefinition.groupKey = cohortDefinition.key.split('/')[1];
                cohortDefinition.selected = ko.observable(false);
                cohortDefinition.selected.subscribe(function(value){
                    if(value) {
                        self.selectNone(cohortDefinition);
                    }
                })
            });
        })

        self.showImportLightBox.subscribe(function(value) {
            if (!value && document.getElementById('cohortInput')) {
                document.getElementById('cohortInput').value = '';
            }
        });

        self.show = function(){
            self.showImportLightBox(true);
            load();
        }

        self.close = function(){
            self.importing(false)
            self.showImportLightBox(false);
        }

        self.selectNone = function(cohortDefinition){
            self.cohortDefinitions().forEach(function(definition){
                if(cohortDefinition.uuid !== definition.uuid){
                    definition.selected(false);
                }
            })
        }

        self.renderCheckbox = function (field, editable) {
            return editable
                ? '<span data-bind="click: function(d, e) { d.' + field + '(!d.' + field + '()); e.stopPropagation(); } , css: { selected: ' + field + '}" class="fa fa-check"></span>'
                : '<span data-bind="css: { selected: ' + field + '}" class="fa fa-check readonly"></span>';
        }

        self.renderVersion = function (data, type, row, meta) {
            if (type === 'display' || type === 'filter') {
                return !row.parent ? "Latest" : "V" + row.version;
            }
            return data;
        }

        self.renderCohortDefinitionLink = function (data, type, row) {
            return '<span class="linkish">' + row.originalFilename + '</span>';
        }

        self.rowClick = function(d){
            if(self.breadCrumbNames().length > 0) {
                return;
            }
            self.breadCrumbNames.push(d.originalFilename);
            self.breadCrumb.push(self.cohortDefinitions());

            var targets = d.dataTargets.slice();
            targets.push(d);
            self.cohortDefinitions(targets);
        }

        self.back = function() {
            self.breadCrumbNames.pop();
            self.cohortDefinitions(self.breadCrumb.pop());
        }

        self.doClick = function(d){
            console.log(d)
        }

        self.checkFileSelected = function() {
            let input = document.getElementById('cohortInput');
            self.isFileSelected(input && typeof input.files[0] !== "undefined");
        }


        self.submitFile = function() {
            let input = document.getElementById('cohortInput');
            self.importing(true);
            let endpoint;
            let data;
            if(self.currentTab() === "listTab"){
                endpoint = params.selectUrl();
                data = JSON.stringify(self.cohortDefinitions().filter(definition => definition.selected())[0]);
                upload(endpoint, data);
            } else {
                var reader = new FileReader();
                reader.readAsText(input.files[0]);
                reader.onload = function (evt) {
                    endpoint = params.fileUrl();
                    data = evt.target.result;
                    var cohortDefinitionJson = JSON.parse(data);
                    if(cohortDefinitionJson["name"] == null && cohortDefinitionJson["ConceptSets"] != null) {
                        data = JSON.stringify({
                            expressionType: "SIMPLE_EXPRESSION",
                            name: input.files[0].name.replace('.cohort', '').split('_').join(' '),
                            expression: evt.target.result
                        });
                    }
                    upload(endpoint, data);
                };
            }
        }

        function upload(endpoint, data){
            var refreshPromise = null;
            var id;
            self.close();
            setTimeout(function(){
                self.model.currentView('loading');

                $.ajax({
                    url: endpoint,
                    method: "POST",
                    contentType: 'application/json',
                    data: data,
                    success: function (result) {
                        id = result.id;
                        self.importing(false);
                        if(self.job) {
                            self.job().status(result.status || "COMPLETE");
                            //sharedState.jobListing.queue(self.job());
                        }
                        if (config.userAuthenticationEnabled) {
                            refreshPromise = authApi.loadUserInfo();
                            refreshPromise.then(function () {
                                self.model.currentView('cohort-definition-manager');
                                params.callback(id);
                            })
                        } else {
                            self.model.currentView('cohort-definition-manager');
                            params.callback(id);
                        }
                    },
                    error: function () {
                        self.close();
                        self.model.currentView('cohort-definitions');
                    }
                })
            }, 1500)
        }

        self.drop = function(data, event){
            self.toggleInDropZone(event);
            console.log(data, event.originalEvent.dataTransfer.files)
            document.getElementById('cohortInput').files = event.originalEvent.dataTransfer.files;
        }

        self.dragOver = function(e){
            e.preventDefault();
        }

        self.toggleInDropZone = function(e){
            e.preventDefault();
            self.draggedOver(!self.draggedOver());
        }
    }
    var component = {
        viewModel: importButton,
        template: view
    };

    ko.components.register('import-button', component);
    return component;
});
