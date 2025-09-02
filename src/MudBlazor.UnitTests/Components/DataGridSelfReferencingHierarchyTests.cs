// Copyright (c) MudBlazor 2021
// MudBlazor licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using AngleSharp.Dom;
using Bunit;
using FluentAssertions;
using MudBlazor.UnitTests.TestComponents.DataGrid;
using NUnit.Framework;

namespace MudBlazor.UnitTests.Components
{
    [TestFixture]
    public class DataGridSelfReferencingHierarchyTests : BunitTest
    {
        [Test]
        public void DataGridSelfReferencingHierarchy_BasicRendering_ShouldDisplayItems()
        {
            var comp = Context.RenderComponent<DataGridSelfReferencingHierarchyTest>();
            
            // Should render the component without errors
            comp.Should().NotBeNull();
            
            // Check that root items are displayed
            var titleCells = comp.FindAll("td").Where(x => x.TextContent.Contains("Project Setup") || 
                                                          x.TextContent.Contains("Feature Development") || 
                                                          x.TextContent.Contains("Testing")).ToArray();
            titleCells.Length.Should().Be(3); // Three root tasks
        }

        [Test]
        public void DataGridSelfReferencingHierarchy_HierarchyButtons_ShouldOnlyShowForItemsWithChildren()
        {
            var comp = Context.RenderComponent<DataGridSelfReferencingHierarchyTest>();
            
            // Find hierarchy column buttons
            var hierarchyButtons = comp.FindAll(".mud-icon-button");
            
            // Should have expand buttons for items with children
            // Project Setup (has 3 children), Feature Development (has 2 children), Setup CI/CD (has 2 children), User Authentication (has 3 children)
            hierarchyButtons.Count.Should().BeGreaterThan(0);
        }

        [Test]
        public void DataGridSelfReferencingHierarchy_ExpandCollapse_ShouldToggleVisibility()
        {
            var comp = Context.RenderComponent<DataGridSelfReferencingHierarchyTest>();
            
            // Initially, child items should not be visible
            var initialRows = comp.FindAll("tr.mud-table-row");
            var initialRowCount = initialRows.Count;
            
            // Click the first expand button to expand "Project Setup"
            var firstExpandButton = comp.FindAll(".mud-icon-button").FirstOrDefault();
            firstExpandButton?.Click();
            
            // After expansion, should have more rows
            var expandedRows = comp.FindAll("tr.mud-table-row");
            expandedRows.Count.Should().BeGreaterThan(initialRowCount);
            
            // Should now see sub-tasks
            var subTaskCells = comp.FindAll("td").Where(x => x.TextContent.Contains("Initialize Repository") ||
                                                            x.TextContent.Contains("Setup CI/CD") ||
                                                            x.TextContent.Contains("Project Documentation"));
            subTaskCells.Should().NotBeEmpty();
        }

        [Test]
        public void DataGridSelfReferencingHierarchy_Indentation_ShouldApplyToFirstColumn()
        {
            var comp = Context.RenderComponent<DataGridSelfReferencingHierarchyTest>();
            
            // Expand first item to show children
            var firstExpandButton = comp.FindAll(".mud-icon-button").FirstOrDefault();
            firstExpandButton?.Click();
            
            // Check for indentation styles on child items
            var cellsWithIndentation = comp.FindAll("td[style*='padding-left']");
            cellsWithIndentation.Should().NotBeEmpty("Child items should have indentation applied");
        }

        [Test]
        public void DataGridSelfReferencingHierarchy_EventCallback_ShouldTriggerOnToggle()
        {
            var comp = Context.RenderComponent<DataGridSelfReferencingHierarchyTest>();
            
            // Initially no events
            comp.Instance.ToggledEvents.Should().BeEmpty();
            
            // Click expand button
            var firstExpandButton = comp.FindAll(".mud-icon-button").FirstOrDefault();
            firstExpandButton?.Click();
            
            // Should have triggered the event
            comp.Instance.ToggledEvents.Should().NotBeEmpty();
            comp.Instance.ToggledEvents.First().IsExpanded.Should().BeTrue();
            comp.Instance.ToggledEvents.First().Item.Title.Should().NotBeNull();
        }
    }
}